export type NodeKind = 'dir' | 'file'

/** Mirrors Rust's `ExcludeReason` (`#[serde(rename_all = "kebab-case")]`). */
export type ExcludeReason = 'dependency-build' | 'lockfile' | 'binary'

export type FileNode = {
  path: string
  parent: string | null
  name: string
  kind: NodeKind
  extension: string | null
  size: number
  depth: number
  hidden: boolean
  ignored: boolean
  excluded: boolean
  excludedReason: ExcludeReason | null
  eligible: boolean
}

/** True means the category is filtered out of the tree during scanning. */
export type ScanOptions = {
  filterHidden: boolean
  filterIgnored: boolean
  filterDependencyBuild: boolean
  filterLockfiles: boolean
  filterBinary: boolean
  customExcludeGlobs: string[]
}

export type ScanStats = {
  visibleFiles: number
  visibleDirectories: number
  eligibleFiles: number
  ignoredFiles: number
  excludedFiles: number
}

export type ScanResult = {
  root: string
  nodes: FileNode[]
  stats: ScanStats
}

export type ExportSettings = {
  outputDir: string
  baseName: string
  separator: string
  includePaths: boolean
  maxLines: number
}

export type ExportResult = {
  parts: string[]
  filesWritten: number
  totalLines: number
  oversizedFiles: string[]
}

export type ScanProgress = {
  visited: number
}

export type ExportProgress = {
  current: number
  total: number
  part: number
  path: string
}

export type QuickFilter = {
  id: string
  label: string
  hint: string
  extensions: readonly string[]
}

export type SavedGlob = {
  id: string
  name: string
  pattern: string
  mode: 'select' | 'exclude'
}
