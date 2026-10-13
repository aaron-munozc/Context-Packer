export type NodeKind = 'dir' | 'file'

/** Mirrors Rust's `ExcludeReason` (`#[serde(rename_all = "kebab-case")]`). */
export type ExcludeReason = 'dependency-build' | 'lockfile'

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

export type ScanOptions = {
  showHidden: boolean
  showIgnored: boolean
  showExcluded: boolean
  showLockfiles: boolean
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
