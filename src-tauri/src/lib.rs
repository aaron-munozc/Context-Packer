use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{self, BufWriter, Write},
    path::{Component, Path, PathBuf},
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
    "7z", "avi", "bin", "bmp", "class", "db", "dll", "dylib", "eot", "exe", "flac", "gif", "gz",
    "ico", "jar", "jpeg", "jpg", "mkv", "mov", "mp3", "mp4", "ogg", "otf", "pdf", "rar", "so",
    "sqlite", "sqlite3", "tar", "tif", "tiff", "ttf", "wasm", "wav", "webm", "webp", "woff",
    "woff2", "xz", "zip", "zst",
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
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanOptions {
    show_hidden: bool,
    show_ignored: bool,
    show_excluded: bool,
    show_lockfiles: bool,
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

fn scan_folder_blocking(
    app: AppHandle,
    root: PathBuf,
    options: ScanOptions,
) -> Result<ScanResult, String> {
    let root = fs::canonicalize(&root).map_err(|error| format!("Cannot open folder: {error}"))?;
    if !root.is_dir() {
        return Err("The selected path is not a folder.".into());
    }

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
        .ignore(!options.show_ignored)
        .git_ignore(!options.show_ignored)
        .git_global(!options.show_ignored)
        .git_exclude(!options.show_ignored)
        .follow_links(false);

    let show_hidden = options.show_hidden;
    let show_excluded = options.show_excluded;
    let show_lockfiles = options.show_lockfiles;

    let filter_root = root.clone();
    walker.filter_entry(move |entry| {
        let path = entry.path();
        if path == filter_root {
            return true;
        }

        let Some(relative) = path.strip_prefix(&filter_root).ok() else {
            return false;
        };

        if !show_hidden && is_hidden_relative(relative) {
            return false;
        }

        if !show_excluded && contains_excluded_dir(relative) {
            return false;
        }

        let is_file = entry.file_type().map_or(false, |kind| kind.is_file());

        if !show_lockfiles
            && is_file
            && relative.file_name().map_or(false, is_lockfile)
        {
            return false;
        }

        if is_file && is_binary_extension(path) {
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
        let excluded_dir = contains_excluded_dir(relative);
        let lockfile = is_file && relative.file_name().map_or(false, is_lockfile);
        let excluded_reason = if excluded_dir {
            Some(ExcludeReason::DependencyBuild)
        } else if lockfile {
            Some(ExcludeReason::Lockfile)
        } else {
            None
        };
        let excluded = excluded_reason.is_some();
        let eligible = is_file && !lockfile && !is_binary_extension(path);
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
            .map(|n| n.to_string_lossy().into_owned())
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
        root: root.display().to_string(),
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
    let root =
        fs::canonicalize(&root).map_err(|error| format!("Cannot access source folder: {error}"))?;
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

    relative_paths.sort_unstable();
    relative_paths.dedup();

    let output_dir = PathBuf::from(&settings.output_dir);
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("Cannot create output folder: {error}"))?;

    let base_name = sanitize_base_name(&settings.base_name);
    cleanup_previous_outputs(&output_dir, &base_name)
        .map_err(|error| format!("Cannot prepare output folder: {error}"))?;

    let total = relative_paths.len();
    let mut parts = Vec::<String>::new();
    let mut current_part = 0usize;
    let mut current_output_lines = 0u64;
    let mut total_lines = 0u64;
    let mut oversized_files = Vec::new();
    let mut writer: Option<BufWriter<File>> = None;

    for (index, relative) in relative_paths.iter().enumerate() {
        let source = safe_join(&root, relative)?;
        let bytes = fs::read(&source).map_err(|error| format!("Cannot read {relative}: {error}"))?;

        let file_content_lines = count_bytes_lines(&bytes);
        let header_lines = if settings.include_paths { 1 } else { 0 };
        let separator_lines = 1;
        let block_lines = file_content_lines + header_lines + separator_lines;

        if file_content_lines > settings.max_lines {
            oversized_files.push(relative.clone());
        }

        if current_output_lines > 0 && current_output_lines + block_lines > settings.max_lines {
            if let Some(mut active) = writer.take() {
                active
                    .flush()
                    .map_err(|error| format!("Cannot flush output: {error}"))?;
            }
            writer = None;
            current_output_lines = 0;
        }

        if writer.is_none() {
            current_part += 1;
            let path = output_dir.join(format!("{base_name}_part{current_part}.txt"));
            let file = File::create(&path)
                .map_err(|error| format!("Cannot create {}: {error}", path.display()))?;
            writer = Some(BufWriter::new(file));
            parts.push(path.display().to_string());
        }

        let active = writer.as_mut().expect("writer must exist");
        write_buffered_block(
            active,
            &bytes,
            relative,
            &settings.separator,
            settings.include_paths,
        )
            .map_err(|error| format!("Cannot export {relative}: {error}"))?;

        current_output_lines += block_lines;
        total_lines += block_lines;

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
            .map_err(|error| format!("Cannot flush final output: {error}"))?;
    }

    Ok(ExportResult {
        parts,
        files_written: total,
        total_lines,
        oversized_files,
    })
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err(format!("Unsafe relative path: {relative}"));
    }

    let candidate = root.join(relative_path);
    let canonical = fs::canonicalize(&candidate)
        .map_err(|error| format!("Cannot resolve {relative}: {error}"))?;

    if !canonical.starts_with(root) {
        return Err(format!(
            "Selected path escapes the source folder: {relative}"
        ));
    }

    Ok(canonical)
}

fn count_bytes_lines(bytes: &[u8]) -> u64 {
    if bytes.is_empty() {
        return 0;
    }

    let mut lines = bytes
        .iter()
        .filter(|&&b| b == b'\n')
        .count() as u64;

    if !bytes.ends_with(b"\n") {
        lines += 1;
    }
    lines
}

fn write_buffered_block<W: Write>(
    writer: &mut W,
    bytes: &[u8],
    relative: &str,
    separator: &str,
    include_path: bool,
) -> io::Result<()> {
    if include_path {
        writer.write_all(b"[")?;
        writer.write_all(relative.as_bytes())?;
        writer.write_all(b"]\n")?;
    }

    writer.write_all(bytes)?;

    if !bytes.is_empty() && !bytes.ends_with(b"\n") {
        writer.write_all(b"\n")?;
    }

    writer.write_all(separator.as_bytes())?;
    writer.write_all(b"\n")?;
    Ok(())
}

fn cleanup_previous_outputs(output_dir: &Path, base_name: &str) -> io::Result<()> {
    if !output_dir.exists() {
        return Ok(());
    }

    let prefix = format!("{base_name}_part");
    for entry in fs::read_dir(output_dir)? {
        let entry = entry?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();
        if name.starts_with(&prefix) && name.ends_with(".txt") {
            let middle = &name[prefix.len()..name.len() - 4];
            if !middle.is_empty() && middle.chars().all(|c| c.is_ascii_digit()) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
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
        .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
}

fn contains_excluded_dir(path: &Path) -> bool {
    path.components()
        .any(|c| EXCLUDED_DIRS.contains(&c.as_os_str().to_str().unwrap_or_default()))
}

fn is_lockfile(name: &std::ffi::OsStr) -> bool {
    name.to_str()
        .map_or(false, |s| LOCKFILES.binary_search(&s).is_ok())
}

fn is_binary_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map_or(false, |ext| {
            BINARY_EXTENSIONS
                .binary_search(&ext.to_ascii_lowercase().as_str())
                .is_ok()
        })
}

fn path_to_slash_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_folder, export_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
