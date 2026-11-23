# Context Forge

**Context Forge** is a local-first desktop utility for turning a source-code folder into one or more tidy text files for AI prompts, code reviews, debugging sessions, and project handoffs.

It uses **Tauri 2 + Rust + React + TypeScript + Vite + Tailwind CSS**. Folder traversal, glob filtering, and export work are performed by the Rust side; the React interface manages the tree, filters, selection rules, and export settings.

## What it does

- Scan a project folder without following symbolic links.
- Browse a virtualized file tree that stays responsive on large projects.
- Search by filename or relative path, then select or clear every matching result.
- Select complete folders, individual files, common source groups, or arbitrary glob patterns.
- Save named glob presets locally and reuse them later.
- Apply a glob either as a **selection rule** or as an **exclusion filter** for scans.
- Turn each default filter on or off independently.
- Keep manual file exceptions when broad folder, extension, or glob rules are active.
- Undo recent selection changes or reset the complete selection.
- Export selected files into numbered `.txt` parts without splitting an individual source file.
- Track scan and export progress, selected file count, and estimated selected size.

## Filtering and selection

### Default filters

The following exclusions are enabled by default. Open **Filters** to change any of them:

| Filter | Default | What it excludes |
|---|---:|---|
| Hidden / dotfiles | On | Paths containing dot-prefixed components, such as `.env` and `.git` |
| Git-ignored | On | Files ignored by repository, `.gitignore`, or applicable global Git rules |
| Dependency / build folders | On | Common generated directories: `.git`, `node_modules`, `target`, and `.target` |
| Lockfiles | On | Common dependency lockfiles such as `Cargo.lock`, `package-lock.json`, and `pnpm-lock.yaml` |
| Binary / media files | On | Common images, archives, audio/video, executables, fonts, databases, and other binary extensions |

Turning a filter off makes those paths visible in the tree. Binary files remain **non-exportable** even when displayed: Context Forge is designed to create readable text context, not to serialize arbitrary binary data.

Filter and export settings are saved in the current app's local WebView storage. **Reset defaults** restores the default filter set. Custom exclusion presets are managed separately in **Globs**.

### Glob presets

Open **Globs** to create, rename, edit, apply, deactivate, or delete reusable patterns. Presets are stored locally on this device; they are not uploaded to a service or included in exported source text.

Each preset has one of two modes:

- **Select matching files** adds the pattern to the current selection rules. Matching eligible files join the queue; explicit file removals can still override the rule.
- **Exclude matching files from scans** removes matching paths from the tree. The active exclusion is saved with the other scan preferences and is applied by Rust before tree rows are created.

Supported glob syntax includes:

| Syntax | Meaning | Example |
|---|---|---|
| `*` | Any characters within one path segment | `*.rs` |
| `**` | Any number of path segments | `src/**/*.tsx` |
| `?` | One character within a path segment | `file?.ts` |
| `[abc]` | One character from a set | `src/[ab]*.ts` |
| `{a,b}` | One of several alternatives | `**/*.{js,ts}` |

A filename-only pattern such as `*.rs` is treated as matching that filename at any directory depth. Patterns use `/` as the path separator, even on Windows. Negated patterns such as `!*.generated.ts` are intentionally not supported in this version; add a positive exclude or selection rule instead.

Examples:

```text
src/**/*.tsx          Select or exclude all TSX files under src
**/*.{rs,toml}        Select Rust source and TOML configuration
*.md                  Match Markdown files anywhere in the project
assets/**             Match everything under assets
**/*.generated.*      Match generated source files
```

The glob editor previews the number of matching eligible files in the current tree. A pattern preview can be lower while an exclusion is active because excluded files are not part of that tree.

### Selection precedence

Selection rules are intentionally layered so broad choices do not remove user exceptions:

1. A manual file override wins. Removing one item from the queue keeps it excluded even if a broader rule matches it.
2. The closest matching folder rule is checked next.
3. Active glob selection rules add matching files.
4. Quick extension groups (Python, JS/TS, Rust, Web, Data, Docs, and Config) add their matching files.

The **Select matching** and **Clear matching** actions operate on the current search results. With an empty search, they operate on every eligible file in the current scan. Folder checkboxes select or clear all eligible files in that folder and its descendants.

**Undo** restores the previous selection state (up to 40 recent changes). **Reset** removes quick rules, glob rules, folder rules, and manual overrides. Neither action changes scan filters or saved glob presets.

## Export behavior

1. Choose the files to include.
2. Open **Configure & export**.
3. Choose an output folder, base filename, line target, separator, and whether to include relative-path headers.
4. Export the pack.

Files are sorted by relative path and written intact. If adding the next complete file block would exceed the configured line target, a new numbered part is started first. A single file larger than the target is allowed to exceed it rather than being split or truncated.

The exporter counts lines and copies bytes in bounded-size buffers rather than loading each whole source file into memory. Newline handling is preserved, with a final newline added where needed to keep file boundaries readable. Empty files are represented by their path header (when enabled) and separator.

New parts are written to a temporary staging directory first. Previous matching `BASE_partN.txt` outputs are protected until every new part has been written; they are restored if publishing the new set fails. This avoids the original behavior of deleting previous output files before a replacement export is ready.

> **Note:** the line target is a packing target, not a hard maximum. An individual oversized file is always preserved in full and is reported in the export summary.

## Privacy and safety

- Folder scanning and export run locally on the machine.
- There is no account, telemetry, upload, or remote processing code in this project.
- The folder walker does not follow symbolic links.
- Export paths are resolved against the selected source root; parent traversal and paths that resolve outside the source folder are rejected.
- Binary files are not exportable, even when their visibility filter is disabled.
- The application does not execute files from the scanned project.

## Requirements

- Node.js 20 or newer (npm included)
- Rust stable toolchain
- Tauri 2 prerequisites for your operating system
- On Windows: Microsoft C++ Build Tools and WebView2 Runtime (normally already present on current Windows installations)

See the official [Tauri prerequisites](https://tauri.app/start/prerequisites/) for platform-specific system packages.

## Development

From the project root:

```bash
npm install
npm run tauri dev
```

For a frontend-only development check:

```bash
npm run check
npm run build
```

Create a distributable desktop build with:

```bash
npm run tauri build
```

The generated installers/bundles are written under `src-tauri/target/release/bundle/`.

## Project structure

```text
context-forge/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
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
    ├── tauri.conf.json
    └── src/
        ├── lib.rs
        └── main.rs
```

## Troubleshooting

- **The folder looks empty:** check whether hidden, Git-ignored, dependency/build, lockfile, binary, or custom exclusion filters are hiding the files you expect.
- **A binary file appears but cannot be selected:** this is intentional. Disable the binary visibility filter to inspect it, but it will remain non-exportable.
- **A glob selects fewer files than expected:** patterns are matched against normalized relative paths. Try `**/*.ext` for all descendants, or a filename-only pattern such as `*.ext`.
- **An export creates multiple parts:** the configured limit is applied to complete file blocks, including optional path headers and separators. A large single file remains intact.
- **A previous export is still present after an error:** that is deliberate. The app stages a replacement first so an unsuccessful export does not remove the last successful output set.
- **The native dialog does not open:** confirm the Tauri dialog plugin is installed and the `dialog:allow-open` capability is present in `src-tauri/capabilities/default.json`.

## License

No license was supplied with the source bundle. Add a `LICENSE` file before distributing the application publicly if you intend to grant reuse rights.
