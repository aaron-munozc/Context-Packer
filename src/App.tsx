import { listen } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  Check,
  ClipboardList,
  FileOutput,
  FolderOpen,
  Gauge,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { exportFiles, scanFolder } from './lib/api'
import { clearSelection, createSelectionState, deriveSelection, isSelected, setFileOverride, setFolderRule, toggleQuickRule, buildRuleSummary } from './lib/selection'
import type { FileNode, ExportProgress, ExportResult, ExportSettings, ScanOptions, ScanProgress } from './lib/types'
import { buildTreeIndex, FileTree } from './components/FileTree'
import { FilterControls } from './components/FilterControls'
import { SelectedQueue } from './components/SelectedQueue'
import { ExporterModal } from './components/ExporterModal'
import './index.css'

const defaultScanOptions: ScanOptions = {
  showHidden: false,
  showIgnored: false,
  showExcluded: false,
  showLockfiles: false,
}

const defaultSettings: ExportSettings = {
  outputDir: '',
  baseName: 'combined_output',
  separator: '------',
  includePaths: true,
  maxLines: 2000,
}

export default function App() {
  const [rootPath, setRootPath] = useState('')
  const [nodes, setNodes] = useState<FileNode[]>([])
  const [scanOptions, setScanOptions] = useState(defaultScanOptions)
  const [selection, setSelection] = useState(createSelectionState)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanError, setScanError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const [exportError, setExportError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(defaultSettings)
  const scanRequestRef = useRef(0)

  const treeIndex = useMemo(() => buildTreeIndex(nodes), [nodes])
  const { selectedFiles, folderSelection } = useMemo(() => deriveSelection(nodes, selection), [nodes, selection])
  const selectedBytes = useMemo(() => selectedFiles.reduce((total, file) => total + file.size, 0), [selectedFiles])
  const ruleSummary = useMemo(() => buildRuleSummary(selection), [selection])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<ScanProgress>('scan-progress', (event) => {
      setScanProgress(event.payload.visited)
    }).then((cleanup) => {
      unlisten = cleanup
    })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<ExportProgress>('export-progress', (event) => {
      setExportProgress(event.payload)
    }).then((cleanup) => {
      unlisten = cleanup
    })
    return () => unlisten?.()
  }, [])

  async function openFolder() {
    let selected: string | string[] | null
    try {
      selected = await openDialog({ directory: true, multiple: false })
    } catch (error) {
      setScanError(formatError(error))
      return
    }
    if (typeof selected !== 'string') return

    const changedFolder = selected !== rootPath
    if (changedFolder) setSelection(clearSelection())
    setSearch('')
    setExportResult(null)
    setExportError('')
    await scan(selected, scanOptions, true)
  }

  async function scan(root: string, options: ScanOptions, updateOutputDir: boolean) {
    const requestId = ++scanRequestRef.current
    setScanning(true)
    setScanProgress(0)
    setScanError('')
    try {
      const result = await scanFolder(root, options)
      if (requestId !== scanRequestRef.current) return
      setRootPath(result.root)
      setNodes(result.nodes)
      if (updateOutputDir || !settings.outputDir) {
        setSettings((current) => ({ ...current, outputDir: result.root }))
      }
    } catch (error) {
      if (requestId === scanRequestRef.current) setScanError(formatError(error))
    } finally {
      if (requestId === scanRequestRef.current) setScanning(false)
    }
  }

  async function rescan() {
    if (!rootPath) return
    await scan(rootPath, scanOptions, false)
  }

  function changeScanOptions(next: ScanOptions) {
    setScanOptions(next)
    if (rootPath) void scan(rootPath, next, false)
  }

  function toggleFile(node: FileNode) {
    if (!node.eligible) return
    setSelection((current) => {
      const nextValue = !isSelected(node, current)
      return setFileOverride(current, node.path, nextValue)
    })
  }

  function toggleFolder(node: FileNode) {
    const state = folderSelection.get(node.path) ?? { selected: 0, eligible: 0 }
    const shouldSelect = state.selected !== state.eligible
    setSelection((current) => setFolderRule(current, node.path, shouldSelect))
  }

  function toggleQuick(id: string) {
    setSelection((current) => toggleQuickRule(current, id))
  }

  function removeSelected(node: FileNode) {
    setSelection((current) => setFileOverride(current, node.path, false))
  }

  async function chooseOutputFolder() {
    let selected: string | string[] | null
    try {
      selected = await openDialog({ directory: true, multiple: false, defaultPath: settings.outputDir || rootPath || undefined })
    } catch (error) {
      setExportError(formatError(error))
      return
    }
    if (typeof selected === 'string') {
      setSettings((current) => ({ ...current, outputDir: selected }))
    }
  }

  async function runExport() {
    if (!rootPath || selectedFiles.length === 0) return
    setExporting(true)
    setExportProgress(null)
    setExportResult(null)
    setExportError('')
    try {
      const result = await exportFiles(
        rootPath,
        selectedFiles.map((file) => file.path),
        settings,
      )
      setExportResult(result)
      setSettingsOpen(false)
    } catch (error) {
      setExportError(formatError(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#090c11] text-slate-100">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight">Context Forge</h1>
              <span className="rounded-full border border-slate-800 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-widest text-slate-600">local</span>
            </div>
            <p className="max-w-xl truncate text-xs text-slate-600">Select source files, keep the exceptions you want, and export compact AI-ready context.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-600">
          {scanning && <span className="inline-flex items-center gap-2 text-indigo-300"><RefreshCw className="size-3.5 animate-spin" />Scanning {scanProgress.toLocaleString()}</span>}
          {exporting && exportProgress && <span className="inline-flex items-center gap-2 text-amber-300"><RefreshCw className="size-3.5 animate-spin" />Exporting {exportProgress.current}/{exportProgress.total}</span>}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.85fr)]">
        <section className="flex min-w-0 min-h-0 flex-col border-r border-slate-800/80">
          <FilterControls
            rootPath={rootPath}
            search={search}
            onSearchChange={setSearch}
            options={scanOptions}
            onOptionsChange={changeScanOptions}
            onOpenFolder={() => void openFolder()}
            onRescan={() => void rescan()}
            scanning={scanning}
            quickRules={selection.quickRules}
            onToggleQuickRule={toggleQuick}
          />

          <div className="flex items-center justify-between border-b border-slate-900 px-4 py-2 text-xs text-slate-600">
            <div className="flex min-w-0 items-center gap-3">
              <span>{nodes.length ? `${nodes.length.toLocaleString()} visible nodes` : 'No folder loaded'}</span>
              {nodes.length > 0 && <span>{nodes.filter((node) => node.kind === 'file' && node.eligible).length.toLocaleString()} eligible files</span>}
            </div>
            {search && <span className="shrink-0 rounded-full bg-slate-900 px-2 py-1 text-slate-500">Search is display-only</span>}
          </div>

          {scanError ? (
            <div className="m-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-4 py-3 text-sm text-rose-300">{scanError}</div>
          ) : (
            <FileTree
              nodes={nodes}
              treeIndex={treeIndex}
              selection={selection}
              onToggleFile={toggleFile}
              onToggleFolder={toggleFolder}
              search={deferredSearch}
              emptyMessage={rootPath ? 'No matching files in the current view.' : 'Open a folder to start building context.'}
            />
          )}
        </section>

        <aside className="flex min-w-0 min-h-0 flex-col bg-slate-950/35">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 text-indigo-300" />
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Selected queue</h2>
                <p className="text-[0.65rem] text-slate-600">{ruleSummary}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelection(clearSelection())}
              disabled={selectedFiles.length === 0 && selection.quickRules.size === 0 && selection.folderRules.size === 0 && selection.fileOverrides.size === 0}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-default disabled:opacity-30"
              title="Clear all selection rules and manual overrides"
            >
              <Trash2 className="size-3.5" />
              Clear all
            </button>
          </div>

          <SelectedQueue files={selectedFiles} onRemove={removeSelected} />

          <div className="shrink-0 border-t border-slate-800/80 p-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileOutput className="size-4 text-emerald-300" />
                  <span className="text-sm font-semibold text-slate-100">Export</span>
                </div>
                <button type="button" onClick={() => setSettingsOpen(true)} className="grid size-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-900 hover:text-slate-300" title="Open export settings">
                  <Settings2 className="size-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Files" value={selectedFiles.length.toLocaleString()} />
                <Metric label="Size" value={formatBytes(selectedBytes)} />
                <Metric label="Limit" value={`${settings.maxLines.toLocaleString()} lines`} />
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-500">
                  <FolderOpen className="size-3.5" />
                  <span className="truncate" title={settings.outputDir}>{settings.outputDir || 'Choose an output folder'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Gauge className="size-3.5" />
                  <span className="truncate">{settings.baseName}_partN.txt · {settings.includePaths ? 'path headers on' : 'path headers off'} · separator “{settings.separator}”</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                disabled={selectedFiles.length === 0}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <FileOutput className="size-4" />
                Configure & export
              </button>
            </div>
          </div>

          {(exportError || exportResult) && (
            <div className="shrink-0 px-3 pb-3">
              {exportError && <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-3 py-2.5 text-xs text-rose-300">{exportError}</div>}
              {exportResult && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5 text-xs text-emerald-200">
                  <div className="flex items-center gap-2 font-semibold"><Check className="size-3.5" /> Export complete</div>
                  <p className="mt-1 text-emerald-300/60">{exportResult.filesWritten} source files → {exportResult.parts.length} part{exportResult.parts.length === 1 ? '' : 's'}. {exportResult.oversizedFiles.length ? `${exportResult.oversizedFiles.length} file${exportResult.oversizedFiles.length === 1 ? '' : 's'} exceeded the line target but remained intact.` : ''}</p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <ExporterModal
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onChooseFolder={() => void chooseOutputFolder()}
        onClose={() => setSettingsOpen(false)}
        onExport={() => void runExport()}
        exporting={exporting}
        selectedCount={selectedFiles.length}
      />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-900 bg-slate-900/45 px-2.5 py-2">
      <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-600">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-slate-300">{value}</p>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
