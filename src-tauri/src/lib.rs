use globset::{GlobBuilder, GlobSet, GlobSetBuilder};
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{self, BufReader, BufWriter, Read, Write},
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

const EXCLUDED_DIRS: &[&str] = &[".git", "node_modules", "target", ".target"];
const LOCKFILES: &[&str] = &[
    "Cargo.lock",
    "Gemfile.lock",
    "Pipfile.lock",
    "bun.lock",
    "bun.lockb",
    "composer.lock",
    "go.work.sum",
    "mix.lock",
    "package-lock.json",
    "pnpm-lock.yaml",
    "poetry.lock",
    "yarn.lock",
];
const BINARY_EXTENSIONS: &[&str] = &[
    "7z", "avi", "bin", "bmp", "class", "db", "dll", "dylib", "eot", "exe", "flac",
    "gif", "gz", "ico", "jar", "jpeg", "jpg", "mkv", "mov", "mp3", "mp4", "ogg",
    "otf", "pdf", "rar", "so", "sqlite", "sqlite3", "tar", "tif", "tiff", "ttf",
    "wasm", "wav", "webm", "webp", "woff", "woff2", "xz", "zip", "zst",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Dir,
    File,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExcludeReason {
    DependencyBuild,
    Lockfile,
    Binary,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ScanOptions {
    filter_hidden: bool,
    filter_ignored: bool,
    filter_dependency_build: bool,
    filter_lockfiles: bool,
    filter_binary: bool,
    custom_exclude_globs: Vec<String>,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            filter_hidden: true,
            filter_ignored: true,
            filter_dependency_build: true,
            filter_lockfiles: true,
            filter_binary: true,
            custom_exclude_globs: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    path: String,
    parent: Option<String>,
    name: String,
    kind: NodeKind,
    extension: Option<String>,
    size: u64,
    depth: usize,
    hidden: bool,
    ignored: bool,
    excluded: bool,
    excluded_reason: Option<ExcludeReason>,
    eligible: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanStats {
    visible_files: usize,
    visible_directories: usize,
    eligible_files: usize,
    ignored_files: usize,
    excluded_files: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanResult {
    root: String,
    nodes: Vec<FileNode>,
    stats: ScanStats,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    visited: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportSettings {
    output_dir: String,
    base_name: String,
    separator: String,
    include_paths: bool,
    max_lines: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProgress {
    current: usize,
    total: usize,
    part: usize,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    parts: Vec<String>,
    files_written: usize,
    total_lines: u64,
    oversized_files: Vec<String>,
}

#[tauri::command]
async fn scan_folder(
    app: AppHandle,
    root: String,
    options: ScanOptions,
) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scan_folder_blocking(app, PathBuf::from(root), options)
    })
    .await
    .map_err(|error| format!("scan worker failed: {error}"))?
}

fn build_glob_set(patterns: &[String]) -> Result<GlobSet, String> {
    let mut builder = GlobSetBuilder::new();
    for raw_pattern in patterns {
        let pattern = raw_pattern.trim().replace('\\', "/").trim_start_matches("./").to_string();
        if pattern.is_empty() {
            continue;
        }
        let has_windows_drive_prefix = pattern.as_bytes().get(1) == Some(&b':')
            && pattern.as_bytes().first().map_or(false, |byte| byte.is_ascii_alphabetic());
        if pattern.starts_with('/') || has_windows_drive_prefix || pattern.split('/').any(|part| part == "..") {
            return Err(format!("Exclude glob '{raw_pattern}' must stay inside the selected project folder"));
        }

        // A trailing slash explicitly identifies a directory. Add both the
        // directory itself and its descendants so WalkBuilder can prune it.
        let directory_only = pattern.ends_with('/');
        let cleaned = pattern.trim_end_matches('/');
        // A filename-only rule should apply at every depth, not just the root.
        let normalized = if cleaned.contains('/') {
            cleaned.to_string()
        } else {
            format!("**/{cleaned}")
        };
        let glob = GlobBuilder::new(&normalized)
            .case_insensitive(true)
            .literal_separator(true)
            .build()
            .map_err(|error| format!("Invalid exclude glob '{raw_pattern}': {error}"))?;
        builder.add(glob);

        if directory_only {
            let descendants = format!("{normalized}/**");
            let glob = GlobBuilder::new(&descendants)
                .case_insensitive(true)
                .literal_separator(true)
                .build()
                .map_err(|error| format!("Invalid directory exclude glob '{raw_pattern}': {error}"))?;
            builder.add(glob);
        }
    }
    builder
        .build()
        .map_err(|error| format!("Cannot compile custom exclude globs: {error}"))
}

fn clean_display_path(path: &Path) -> String {
    let raw = path.to_string_lossy();
    #[cfg(windows)]
    if let Some(stripped) = raw.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{stripped}");
    } else if let Some(stripped) = raw.strip_prefix(r"\\?\") {
        return stripped.to_string();
    }
    raw.into_owned()
}

fn scan_folder_blocking(
    app: AppHandle,
    root: PathBuf,
    options: ScanOptions,
) -> Result<ScanResult, String> {
    let root = fs::canonicalize(&root).map_err(|error| format!("Cannot open folder: {error}"))?;
    if !root.is_dir() {
        return Err("The selected path is not a folder.".into());
    }

    let custom_globs = build_glob_set(&options.custom_exclude_globs)?;

    // This matcher is kept enabled even when ignored files are shown, so each row
    // can still be labeled as ignored in the UI.
    let mut matcher_builder = WalkBuilder::new(&root);
    matcher_builder
        .standard_filters(false)
        .hidden(false)
        .ignore(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .follow_links(false);
    let mut matchers = matcher_builder.build_matchers();

    let mut walker = WalkBuilder::new(&root);
    walker
        .standard_filters(false)
        .hidden(false)
        .ignore(options.filter_ignored)
        .git_ignore(options.filter_ignored)
        .git_global(options.filter_ignored)
        .git_exclude(options.filter_ignored)
        .follow_links(false);

    let filter_root = root.clone();
    let filter_hidden = options.filter_hidden;
    let filter_dependency_build = options.filter_dependency_build;
    let filter_lockfiles = options.filter_lockfiles;
    let filter_binary = options.filter_binary;
    walker.filter_entry(move |entry| {
        let path = entry.path();
        if path == filter_root {
            return true;
        }

        let Some(relative) = path.strip_prefix(&filter_root).ok() else {
            return false;
        };

        if filter_hidden && is_hidden_relative(relative) {
            return false;
        }
        if filter_dependency_build && contains_excluded_dir(relative) {
            return false;
        }

        let file_type = entry.file_type();
        let is_file = file_type.map_or(false, |kind| kind.is_file());
        if filter_lockfiles && is_file && relative.file_name().map_or(false, is_lockfile) {
            return false;
        }
        if filter_binary && is_file && is_binary_extension(path) {
            return false;
        }
        if custom_globs.is_match(relative) {
            return false;
        }
        true
    });

    let mut nodes = Vec::new();
    let mut visible_files = 0usize;
    let mut visible_directories = 0usize;
    let mut eligible_files = 0usize;
    let mut ignored_files = 0usize;
    let mut excluded_files = 0usize;
    let mut visited = 0usize;

    nodes.push(FileNode {
        path: String::new(),
        parent: None,
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| root.display().to_string()),
        kind: NodeKind::Dir,
        extension: None,
        size: 0,
        depth: 0,
        hidden: false,
        ignored: false,
        excluded: false,
        excluded_reason: None,
        eligible: false,
    });

    for result in walker.build() {
        let entry = match result {
            Ok(entry) => entry,
            Err(error) => {
                eprintln!("scan warning: {error}");
                continue;
            }
        };

        let path = entry.path();
        if path == root {
            continue;
        }
        let Some(relative) = path.strip_prefix(&root).ok() else {
            continue;
        };
        let relative_string = path_to_slash_string(relative);
        if relative_string.is_empty() {
            continue;
        }

        visited += 1;
        if visited % 512 == 0 {
            let _ = app.emit("scan-progress", ScanProgress { visited });
        }

        let file_type = entry.file_type();
        let is_dir = file_type.map_or(false, |kind| kind.is_dir());
        let is_file = file_type.map_or(false, |kind| kind.is_file());
        if !is_dir && !is_file {
            continue;
        }

        let ignored = matchers
            .first_mut()
            .map_or(false, |matcher| matcher.matched(relative, is_dir).is_ignore());
        let hidden = is_hidden_relative(relative);
        let dependency_dir = contains_excluded_dir(relative);
        let lockfile = is_file && relative.file_name().map_or(false, is_lockfile);
        let binary = is_file && is_binary_extension(path);
        let excluded_reason = if dependency_dir {
            Some(ExcludeReason::DependencyBuild)
        } else if lockfile {
            Some(ExcludeReason::Lockfile)
        } else if binary {
            Some(ExcludeReason::Binary)
        } else {
            None
        };
        let excluded = excluded_reason.is_some();
        // Binary files can be displayed when the filter is disabled, but are
        // intentionally never exportable as text context.
        let eligible = is_file && !binary;
        let size = if is_file {
            fs::metadata(path).map_or(0, |metadata| metadata.len())
        } else {
            0
        };
        let extension = path
            .extension()
            .map(|ext| ext.to_string_lossy().to_ascii_lowercase());
        let parent = relative.parent().map(path_to_slash_string);
        let depth = relative.components().count();
        let name = relative
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| relative_string.clone());

        if is_file {
            visible_files += 1;
            if eligible {
                eligible_files += 1;
            }
            if ignored {
                ignored_files += 1;
            }
            if excluded {
                excluded_files += 1;
            }
        } else {
            visible_directories += 1;
        }

        nodes.push(FileNode {
            path: relative_string,
            parent,
            name,
            kind: if is_dir { NodeKind::Dir } else { NodeKind::File },
            extension,
            size,
            depth,
            hidden,
            ignored,
            excluded,
            excluded_reason,
            eligible,
        });
    }

    let _ = app.emit("scan-progress", ScanProgress { visited });

    Ok(ScanResult {
        root: clean_display_path(&root),
        nodes,
        stats: ScanStats {
            visible_files,
            visible_directories,
            eligible_files,
            ignored_files,
            excluded_files,
        },
    })
}

#[tauri::command]
async fn export_files(
    app: AppHandle,
    root: String,
    relative_paths: Vec<String>,
    settings: ExportSettings,
) -> Result<ExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_files_blocking(app, PathBuf::from(root), relative_paths, settings)
    })
    .await
    .map_err(|error| format!("export worker failed: {error}"))?
}

fn export_files_blocking(
    app: AppHandle,
    root: PathBuf,
    mut relative_paths: Vec<String>,
    settings: ExportSettings,
) -> Result<ExportResult, String> {
    let root = fs::canonicalize(&root)
        .map_err(|error| format!("Cannot access source folder: {error}"))?;
    if !root.is_dir() {
        return Err("The source root is not a folder.".into());
    }
    if settings.max_lines == 0 {
        return Err("Max lines must be at least 1.".into());
    }
    if settings.separator.trim().is_empty() {
        return Err("Separator cannot be empty.".into());
    }
    if settings.separator.contains('\n') || settings.separator.contains('\r') {
        return Err("Separator must fit on a single line.".into());
    }
    if relative_paths.is_empty() {
        return Err("No files were selected.".into());
    }
    if settings.output_dir.trim().is_empty() {
        return Err("Choose an output folder before exporting.".into());
    }

    relative_paths.sort_unstable();
    relative_paths.dedup();

    let requested_output_dir = PathBuf::from(&settings.output_dir);
    fs::create_dir_all(&requested_output_dir)
        .map_err(|error| format!("Cannot create output folder: {error}"))?;
    let output_dir = fs::canonicalize(&requested_output_dir)
        .map_err(|error| format!("Cannot resolve output folder: {error}"))?;
    if !output_dir.is_dir() {
        return Err("The output path is not a folder.".into());
    }

    let base_name = sanitize_base_name(&settings.base_name);
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let stage_dir = output_dir.join(format!(
        ".{base_name}.context-packer-stage-{}-{stamp}",
        std::process::id()
    ));
    fs::create_dir(&stage_dir)
        .map_err(|error| format!("Cannot create temporary export workspace: {error}"))?;

    let staged = write_export_stage(&app, &root, &relative_paths, &settings, &stage_dir);
    let mut result = match staged {
        Ok(result) => result,
        Err(error) => {
            let _ = fs::remove_dir_all(&stage_dir);
            return Err(error);
        }
    };

    if let Err(error) = publish_staged_parts(&stage_dir, &output_dir, &base_name, result.parts.len()) {
        let _ = fs::remove_dir_all(&stage_dir);
        return Err(error);
    }

    result.parts = (1..=result.parts.len())
        .map(|part| clean_display_path(&output_dir.join(format!("{base_name}_part{part}.txt"))))
        .collect();
    let _ = fs::remove_dir_all(&stage_dir);
    Ok(result)
}

fn write_export_stage(
    app: &AppHandle,
    root: &Path,
    relative_paths: &[String],
    settings: &ExportSettings,
    stage_dir: &Path,
) -> Result<ExportResult, String> {
    let total = relative_paths.len();
    let mut parts = Vec::<String>::new();
    let mut current_part = 0usize;
    let mut current_output_lines = 0u64;
    let mut total_lines = 0u64;
    let mut oversized_files = Vec::new();
    let mut writer: Option<BufWriter<File>> = None;

    for (index, relative) in relative_paths.iter().enumerate() {
        let source = safe_join(root, relative)?;
        if is_binary_extension(&source) {
            return Err(format!("Binary files cannot be exported as text context: {relative}"));
        }
        let (file_lines, has_bytes, ends_with_newline) = inspect_file_lines(&source)
            .map_err(|error| format!("Cannot inspect {relative}: {error}"))?;
        let header_lines = if settings.include_paths { 1 } else { 0 };
        // Every file block ends with one separator line, including empty files.
        let block_lines = file_lines + header_lines + 1;

        if file_lines > settings.max_lines {
            oversized_files.push(relative.clone());
        }

        if current_output_lines > 0
            && current_output_lines.saturating_add(block_lines) > settings.max_lines
        {
            if let Some(mut active) = writer.take() {
                active
                    .flush()
                    .map_err(|error| format!("Cannot flush temporary output: {error}"))?;
            }
            current_output_lines = 0;
        }

        if writer.is_none() {
            current_part += 1;
            let path = stage_dir.join(format!("part{current_part}.txt"));
            let file = File::create(&path)
                .map_err(|error| format!("Cannot create temporary part: {error}"))?;
            writer = Some(BufWriter::new(file));
            parts.push(path.display().to_string());
        }

        let active = writer.as_mut().expect("writer must exist after initialization");
        write_file_block(
            active,
            &source,
            relative,
            &settings.separator,
            settings.include_paths,
            has_bytes,
            ends_with_newline,
        )
        .map_err(|error| format!("Cannot export {relative}: {error}"))?;

        current_output_lines = current_output_lines.saturating_add(block_lines);
        total_lines = total_lines.saturating_add(block_lines);

        let _ = app.emit(
            "export-progress",
            ExportProgress {
                current: index + 1,
                total,
                part: current_part,
                path: relative.clone(),
            },
        );
    }

    if let Some(mut active) = writer {
        active
            .flush()
            .map_err(|error| format!("Cannot flush final temporary output: {error}"))?;
    }

    Ok(ExportResult {
        parts,
        files_written: total,
        total_lines,
        oversized_files,
    })
}

fn publish_staged_parts(
    stage_dir: &Path,
    output_dir: &Path,
    base_name: &str,
    part_count: usize,
) -> Result<(), String> {
    let backup_dir = stage_dir.join("previous");
    fs::create_dir(&backup_dir)
        .map_err(|error| format!("Cannot prepare export rollback: {error}"))?;
    let prefix = format!("{base_name}_part");

    // Gather the old outputs before moving any of them. This keeps a directory
    // enumeration error from leaving a half-moved set of previous exports.
    let mut existing = Vec::<(PathBuf, PathBuf)>::new();
    for entry in fs::read_dir(output_dir)
        .map_err(|error| format!("Cannot inspect output folder: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Cannot inspect output entry: {error}"))?;
        let original = entry.path();
        if is_generated_part_name(&entry.file_name(), &prefix) && original.is_file() {
            existing.push((original, backup_dir.join(entry.file_name())));
        }
    }

    let mut previous_files = Vec::<(PathBuf, PathBuf)>::new();
    for (original, backup) in existing {
        if let Err(error) = fs::rename(&original, &backup) {
            for (old_path, backup_path) in previous_files.iter().rev() {
                let _ = fs::rename(backup_path, old_path);
            }
            return Err(format!(
                "Cannot protect previous output {}: {error}; previous outputs were restored where possible",
                original.display()
            ));
        }
        previous_files.push((original, backup));
    }

    let mut published = Vec::<PathBuf>::new();
    for part in 1..=part_count {
        let staged = stage_dir.join(format!("part{part}.txt"));
        let destination = output_dir.join(format!("{base_name}_part{part}.txt"));
        if let Err(error) = fs::rename(&staged, &destination) {
            for path in &published {
                let _ = fs::remove_file(path);
            }
            for (original, backup) in previous_files.iter().rev() {
                let _ = fs::rename(backup, original);
            }
            return Err(format!(
                "Cannot publish {}: {error}; previous outputs were restored where possible",
                destination.display()
            ));
        }
        published.push(destination);
    }

    // The stage directory (including backed-up older parts) is deleted only
    // after every new part has been successfully published.
    Ok(())
}

fn is_generated_part_name(name: &std::ffi::OsStr, prefix: &str) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    if !name.starts_with(prefix) || !name.ends_with(".txt") {
        return false;
    }
    let middle = &name[prefix.len()..name.len() - 4];
    !middle.is_empty() && middle.chars().all(|character| character.is_ascii_digit())
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!("Unsafe relative path: {relative}"));
    }

    let candidate = root.join(relative_path);
    let canonical = fs::canonicalize(&candidate)
        .map_err(|error| format!("Cannot resolve {relative}: {error}"))?;
    if !canonical.starts_with(root) {
        return Err(format!("Selected path escapes the source folder: {relative}"));
    }
    if !canonical.is_file() {
        return Err(format!("Selected path is no longer a file: {relative}"));
    }
    Ok(canonical)
}

fn inspect_file_lines(path: &Path) -> io::Result<(u64, bool, bool)> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut buffer = [0u8; 64 * 1024];
    let mut newline_count = 0u64;
    let mut has_bytes = false;
    let mut last_byte = 0u8;

    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        has_bytes = true;
        newline_count += buffer[..count].iter().filter(|&&byte| byte == b'\n').count() as u64;
        last_byte = buffer[count - 1];
    }

    let ends_with_newline = has_bytes && last_byte == b'\n';
    let lines = if !has_bytes {
        0
    } else {
        newline_count + u64::from(!ends_with_newline)
    };
    Ok((lines, has_bytes, ends_with_newline))
}

fn write_file_block<W: Write>(
    writer: &mut W,
    source: &Path,
    relative: &str,
    separator: &str,
    include_path: bool,
    has_bytes: bool,
    ends_with_newline: bool,
) -> io::Result<()> {
    if include_path {
        writer.write_all(b"[")?;
        writer.write_all(relative.as_bytes())?;
        writer.write_all(b"]\n")?;
    }

    let mut reader = BufReader::new(File::open(source)?);
    io::copy(&mut reader, writer)?;
    if has_bytes && !ends_with_newline {
        writer.write_all(b"\n")?;
    }
    writer.write_all(separator.as_bytes())?;
    writer.write_all(b"\n")?;
    Ok(())
}

fn sanitize_base_name(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    for character in value.trim().chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
            result.push(character);
        } else {
            result.push('_');
        }
    }

    let trimmed = result.trim_matches(['.', ' ']).to_string();
    if trimmed.is_empty() {
        "combined_output".into()
    } else {
        trimmed
    }
}

fn is_hidden_relative(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str().to_string_lossy().starts_with('.'))
}

fn contains_excluded_dir(path: &Path) -> bool {
    path.components()
        .any(|component| EXCLUDED_DIRS.contains(&component.as_os_str().to_str().unwrap_or_default()))
}

fn is_lockfile(name: &std::ffi::OsStr) -> bool {
    name.to_str().map_or(false, |value| LOCKFILES.contains(&value))
}

fn is_binary_extension(path: &Path) -> bool {
    path.extension().and_then(|extension| extension.to_str()).map_or(false, |extension| {
        let extension = extension.to_ascii_lowercase();
        BINARY_EXTENSIONS.contains(&extension.as_str())
    })
}

fn path_to_slash_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_folder, export_files])
        .run(tauri::generate_context!())
        .expect("error while running Context Packer");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_lockfiles_without_relying_on_sorted_constants() {
        assert!(is_lockfile(std::ffi::OsStr::new("Cargo.lock")));
        assert!(is_lockfile(std::ffi::OsStr::new("package-lock.json")));
        assert!(!is_lockfile(std::ffi::OsStr::new("Cargo.toml")));
    }

    #[test]
    fn recognizes_binary_extensions_case_insensitively() {
        assert!(is_binary_extension(Path::new("assets/Logo.PNG")));
        assert!(is_binary_extension(Path::new("archive.ZIP")));
        assert!(!is_binary_extension(Path::new("src/main.rs")));
    }

    #[test]
    fn filename_only_custom_globs_match_at_any_depth() {
        let patterns = vec!["*.tmp".to_string()];
        let matcher = build_glob_set(&patterns).expect("glob should compile");
        assert!(matcher.is_match(Path::new("cache.tmp")));
        assert!(matcher.is_match(Path::new("src/generated/cache.tmp")));
        assert!(!matcher.is_match(Path::new("src/generated/cache.rs")));
    }

    #[test]
    fn trailing_slash_globs_match_directories_and_their_contents() {
        let patterns = vec!["vendor/".to_string()];
        let matcher = build_glob_set(&patterns).expect("directory glob should compile");
        assert!(matcher.is_match(Path::new("vendor")));
        assert!(matcher.is_match(Path::new("vendor/library/source.rs")));
        assert!(!matcher.is_match(Path::new("src/vendor.rs")));
    }

    #[test]
    fn custom_globs_reject_parent_directory_segments_and_absolute_paths() {
        assert!(build_glob_set(&["../outside/**".to_string()]).is_err());
        assert!(build_glob_set(&["src/../../outside".to_string()]).is_err());
        assert!(build_glob_set(&["C:/outside/**".to_string()]).is_err());
    }

    #[test]
    fn scan_defaults_keep_the_standard_exclusions_enabled() {
        let options = ScanOptions::default();
        assert!(options.filter_hidden);
        assert!(options.filter_ignored);
        assert!(options.filter_dependency_build);
        assert!(options.filter_lockfiles);
        assert!(options.filter_binary);
        assert!(options.custom_exclude_globs.is_empty());
    }

    #[test]
    fn unsafe_relative_paths_are_rejected() {
        let root = Path::new(".");
        assert!(safe_join(root, "../outside.txt").is_err());
        assert!(safe_join(root, "nested/../../outside.txt").is_err());
    }
}
