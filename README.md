<div align="center">
  <img src="./public/logo.svg" alt="Context Packer logo" width="172" />
  <h1>Context Packer</h1>
  <p>A local-first desktop app for choosing source files and exporting clean, complete text packs.</p>
  <p><sub>Tauri 2 · React 19 · TypeScript · Rust</sub></p>
</div>

---

## Overview

**Context Packer** turns a project folder into one or more numbered `.txt` files that are convenient to share with an AI assistant, attach to a code review, use for debugging, or include in a project handoff.

Instead of dumping an entire repository, you choose exactly what belongs in the pack. Browse the file tree, search by path or filename, select folders or file groups, apply custom glob patterns, and export the selected files without truncating individual source files.

Context Packer is a **desktop utility, not an AI client**. It prepares the text files; you decide where to use them.

## Features

- **Fast project browsing:** scan a folder and browse its contents in a virtualized file tree.
- **Search and bulk actions:** find files by name or relative path, then select or clear the current matches.
- **Flexible selection:** choose individual files, whole folders, extension groups, search results, or custom glob matches.
- **Useful defaults:** hide common noise such as dotfiles, Git-ignored content, dependency folders, lockfiles, and known binary formats.
- **Customizable filtering:** switch each built-in filter on or off independently and add your own exclusion patterns.
- **Reusable glob library:** apply a one-off pattern immediately, or save a named preset to reuse later.
- **Starter patterns:** load templates for source code, tests, documentation, configuration, generated assets, build folders, dependencies, and lockfiles.
- **Selection safety net:** keep manual exceptions, undo recent selection changes, and reset the current selection without deleting saved presets.
- **Complete-file export:** split output into numbered parts at file boundaries; individual files are never truncated to fit the line target.
- **Local-first by design:** scanning, filtering, selection, preset storage, and export run on your machine.

## Quick start

### Requirements

- **Node.js 20 or newer** with npm
- **Rust stable toolchain**
- Tauri 2 system prerequisites for your operating system
- **Windows:** Microsoft C++ Build Tools and the WebView2 Runtime (usually already present on current Windows installations)

See the official [Tauri prerequisites](https://tauri.app/start/prerequisites/) for the packages required by your platform.

### Run in development

From the project root:

```bash
npm install
npm run tauri dev
```

### Check and build

```bash
# TypeScript check
npm run check

# Production frontend build
npm run build

# Build the desktop application and installer/bundle
npm run tauri build
```

Generated desktop bundles are placed under `src-tauri/target/release/bundle/`.

## Typical workflow

1. **Open a folder.** Choose the project or source directory you want to prepare.
2. **Adjust visibility.** Open **Filters** to reveal hidden files, Git-ignored files, dependency folders, lockfiles, or binary files when needed.
3. **Find what matters.** Search by filename or relative path. The search is for browsing and bulk selection; it does not change the scan itself.
4. **Build your selection.** Select individual files, folders, quick-select groups, search matches, or glob patterns. Remove individual files from the queue to create exceptions.
5. **Configure the pack.** Choose an output folder, base filename, line target, separator, and whether to include relative-path headers.
6. **Export.** Context Packer writes numbered `.txt` parts and reports the number of files, output parts, and any files larger than the line target.

## Filters and selection

### Built-in exclusion filters

Open **Filters** in the source explorer. Each option can be enabled or disabled independently; all five are enabled by default.

| Filter | Default | What it hides |
|---|:---:|---|
| Hidden / dotfiles | On | Paths containing dot-prefixed components, such as `.env`, `.config`, and `.git` |
| Git-ignored | On | Entries ignored by repository `.gitignore`, `.git/info/exclude`, or applicable global Git rules |
| Dependency / build folders | On | The built-in folder list: `.git`, `node_modules`, `target`, and `.target` |
| Lockfiles | On | Common dependency lockfiles, including `Cargo.lock`, `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock` |
| Binary / media files | On | Known image, archive, audio/video, executable, font, database, and other binary extensions |

Changing a filter automatically rescans the current folder. **Reset defaults** restores the five built-in switches while preserving any active custom exclusion globs.

Disabling the binary visibility filter allows known binary files to appear in the tree, but they remain **non-selectable and non-exportable**. Context Packer is designed to produce readable text context, not to serialize arbitrary binary data.

> **Tip:** the default dependency/build list is intentionally conservative. For folders such as `dist`, `build`, `coverage`, `.next`, or `vendor`, load the **Build output folders** starter exclusion pattern or create your own glob.

### Quick-select groups

Quick-select chips are **selection rules**, not visibility filters. They add or remove matching eligible files from the selection without hiding anything in the explorer.

| Group | Included file types |
|---|---|
| Python | `.py`, `.pyi` |
| JS / TS | `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts` |
| Rust | `.rs` |
| Web | `.css`, `.scss`, `.sass`, `.less`, `.html`, `.htm`, `.vue`, `.svelte` |
| Data | `.json`, `.jsonc`, `.yaml`, `.yml`, `.toml`, `.xml` |
| Docs | `.md`, `.mdx`, `.txt`, `.rst`, `.adoc` |
| Config | `.ini`, `.conf`, `.cfg`, `.env`, `.properties`, plus common dot-config files and `Dockerfile`, `Makefile`, and `justfile` |

A file can still be removed manually from the queue even when it matches an active quick-select group.

### Custom glob patterns

Open **Globs** to manage reusable patterns. A pattern can be used immediately, saved for later, or both.

#### Two separate actions

- **Apply now / Activate filter:** activates the pattern for the current session or current scan. It does not save the pattern in the preset library.
- **Save preset:** stores a named pattern locally. Saving does not activate it; you can activate it later from the library.

You can also load one of the starter templates. Loading a starter only fills the editor; choose **Apply now** or **Save preset** to use it.

#### Starter templates

| Starter | Mode | Intended use |
|---|---|---|
| Source code | Select | Select common programming-language source files |
| Tests and specs | Select | Select files with `.test` or `.spec` naming patterns |
| Documentation | Select | Select Markdown and other common documentation files |
| Configuration files | Select | Select JSON, YAML, TOML, INI, and related config files |
| Generated and minified files | Exclude | Hide common generated and minified files |
| Build output folders | Exclude | Hide `dist`, `build`, `coverage`, `.next`, and `vendor` folders |
| Dependency folders | Exclude | Hide `.git`, `node_modules`, `target`, and `.target` folders |
| Common lockfiles | Exclude | Hide common package-manager and build-system lockfiles |

Each pattern has one of two modes:

- **Select matching files:** adds matching eligible text files to the current selection.
- **Exclude matching files from scans:** removes matching paths from the explorer when the scan runs. Active exclusion patterns are included in the saved filter preferences.

Saved presets live in the app's local WebView storage. They are not uploaded, written into the source folder, or included in exported text. The preset library persists across launches for the same app installation/profile. Active **selection** rules are session-only and reset when the app closes; saved presets remain available so you can activate them again. Active **exclusion** rules persist with the scan preferences.

Editing a saved preset updates the library entry. If you change an active preset's pattern or mode, the old active rule is removed; activate the updated pattern when you are ready to use it. Deleting a preset also deactivates its matching active rule.

#### Supported glob syntax

Patterns are relative to the selected project folder and use `/` as the path separator on every platform. Matching is case-insensitive.

| Syntax | Meaning | Example |
|---|---|---|
| `*` | Any characters within one path segment | `*.rs` |
| `**` | Any number of path segments; use it as a complete segment | `src/**/*.tsx` |
| `?` | One character within one path segment | `file?.ts` |
| `[abc]` | One character from a set | `src/[ab]*.ts` |
| `[!abc]` | One character not in a set | `src/[!ab]*.ts` |
| `{a,b}` | One of several alternatives | `**/*.{js,ts}` |
| trailing `/` | A directory and everything inside it | `vendor/` |

A filename-only pattern such as `*.rs` is matched at any directory depth. Examples:

```text
src/**/*.tsx                  TypeScript React files under src
**/*.{rs,toml}                Rust source and TOML configuration
*.md                          Markdown files at any depth
assets/                       Everything inside assets
**/*.{min.js,min.css}          Minified assets
**/{dist,build,coverage}/      Common build and coverage folders
```

Patterns must stay inside the selected project folder. Absolute paths, parent-directory (`..`) segments, and leading negation (`!pattern`) are rejected. `**` must be a complete path segment, and nested brace alternatives are not supported. Use a positive include or exclude pattern instead of a negated glob.

The editor previews how many matching eligible files are present in the current visible scan. An exclusion preview may show fewer matches while the pattern is active because excluded paths have already been removed from the tree.

To replace a built-in exclusion group with your own rules, turn that built-in filter off and activate a saved exclusion preset.

### Selection behavior and precedence

Selection rules are evaluated in this order:

1. **Manual file override** — an individual include or removal takes priority over broader rules.
2. **Nearest folder rule** — the closest selected or cleared parent folder rule applies.
3. **Glob selection rules** — active include patterns select matching files.
4. **Quick-select groups** — active extension groups select matching files.

Folder checkboxes apply to all eligible files in that folder and its descendants. Selecting or clearing a folder removes older nested folder rules and one-file exceptions inside that branch; you can then add new individual exceptions.

The **Select matching** and **Clear matching** actions operate on the current search results. With an empty search, they apply to the entire current scan: Select matching selects all eligible files, while Clear matching clears the selection. **Undo** restores the previous selection state (up to 40 recent changes). **Reset** removes quick-select rules, glob selection rules, folder rules, and manual overrides. Neither action deletes saved glob presets or changes the scan filters.

## Exporting a context pack

Choose **Configure & export** to set:

- **Output folder** — where the numbered text parts will be written.
- **Base filename** — used for files such as `combined_output_part1.txt`.
- **Max lines per part** — the target used to decide when to begin the next part.
- **Separator** — a single-line marker placed between file blocks.
- **Include relative paths** — adds a header such as `[src/main.rs]` before each file's content.

Files are sorted by relative path and written as complete blocks. When the next block would push a non-empty part beyond the line target, a new part is started first. A single oversized source file is kept intact rather than split or truncated, and files whose content alone exceeds the configured line target are listed in the export summary.

The line target is a **packing target, not a hard maximum**. Optional path headers and separators also contribute to the output line count.

The exporter reads and copies files using bounded-size buffers rather than loading each entire file into memory. It preserves file bytes and adds a final newline when a non-empty source file does not already end with one, keeping the following separator on its own line. Empty files are represented by their optional path header and separator.

New parts are written to a temporary staging directory first. Existing matching `BASE_partN.txt` files are backed up before the new parts are published. If publishing fails, Context Packer attempts to restore the previous outputs; the stage and backup files are cleaned up after a successful publish.

## Privacy and safety

- Folder scanning, selection, preset storage, and export are local to the desktop app.
- The project contains no account system, analytics/telemetry integration, upload flow, or remote AI-processing code.
- The folder walker does not follow symbolic links.
- Export paths are resolved against the selected source root; absolute paths, parent traversal, and paths that resolve outside the source folder are rejected.
- Known binary files are not exportable, even when their visibility filter is disabled.
- The application does not execute files from the scanned project.

## Development notes

### Project structure

```text
context-packer/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── context-packer-mark.png
├── src/
│   ├── assets/context-packer-mark.png
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   ├── ExporterModal.tsx
│   │   ├── FileTree.tsx
│   │   ├── FilterControls.tsx
│   │   ├── GlobManager.tsx
│   │   └── SelectedQueue.tsx
│   └── lib/
│       ├── api.ts
│       ├── fuzzy.ts
│       ├── selection.ts
│       └── types.ts
└── src-tauri/
    ├── capabilities/default.json
    ├── Cargo.toml
    ├── build.rs
    └── src/
        ├── lib.rs
        └── main.rs
```

### Useful implementation details

- The frontend uses React and TypeScript, with Vite for development and bundling.
- Tauri commands call the Rust scanner and exporter; longer operations run on blocking workers so they do not block the UI thread.
- The file tree is virtualized to keep large directory listings responsive.
- The visual theme is centralized in `src/index.css`. The `:root` `--forge-*` variables define the main logo-inspired color palette.
- The app's scan preferences, export settings, and saved glob presets are stored in local WebView storage. Active selection rules are deliberately session-only.
- Older `Context Forge` storage keys are read and migrated to the current `Context Packer` keys when possible.

## Troubleshooting

| Problem | What to check |
|---|---|
| The folder looks empty | Check hidden, Git-ignored, dependency/build, lockfile, binary, and custom exclusion filters. Also clear the search field. |
| A binary file appears but cannot be selected | This is intentional. It can be shown for inspection, but binary files are not eligible for text export. |
| A glob will not apply | Read the inline validation message. Check for absolute paths, `..`, leading negation, nested braces, or a `**` that is not a complete path segment. |
| A glob matches fewer files than expected | Patterns match normalized relative paths. Use `**/*.ext` for descendants or a filename-only pattern such as `*.ext` for any depth. |
| A saved glob is missing | Presets are local to the current app installation/WebView profile; they are not synchronized between devices or operating-system accounts. |
| An export creates multiple parts | The line target is applied to complete file blocks, including optional path headers and separators. A large source file remains intact. |
| Previous output files remain after an export error | This is deliberate. The exporter stages the replacement set and attempts to restore previous outputs if publishing fails. |
| The native folder dialog does not open | Confirm that the Tauri dialog plugin is installed and `dialog:allow-open` is present in `src-tauri/capabilities/default.json`. |

## License

No license was included with the supplied source project. Add a `LICENSE` file before distributing the application publicly if you intend to grant reuse rights.

---

<div align="center">
  <sub>Built for focused project context. Keep the useful files, leave the noise behind.</sub>
</div>
