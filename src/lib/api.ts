import { invoke } from '@tauri-apps/api/core'
import type { ExportResult, ExportSettings, ScanOptions, ScanResult } from '@/lib/types'

export function scanFolder(root: string, options: ScanOptions): Promise<ScanResult> {
  return invoke<ScanResult>('scan_folder', { root, options })
}

export function exportFiles(
  root: string,
  relativePaths: string[],
  settings: ExportSettings,
): Promise<ExportResult> {
  return invoke<ExportResult>('export_files', {
    root,
    relativePaths,
    settings,
  })
}
