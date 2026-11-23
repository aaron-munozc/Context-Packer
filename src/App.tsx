import { listen } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  ClipboardList,
  FileOutput,
  FolderOpen,
  Gauge,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { exportFiles, scanFolder } from './lib/api'
import { fuzzyMatch, validateGlob } from './lib/fuzzy'
import {
  addGlobRule,
  buildRuleSummary,
  clearSelection,
  createSelectionState,
  deriveSelection,
  isSelected,
  removeGlobRule,
  setFileOverride,
  setFolderRule,
  setManyFileOverrides,
  toggleQuickRule,
} from './lib/selection'
import type { FileNode, ExportProgress, ExportResult, ExportSettings, ScanOptions, ScanProgress } from './lib/types'
import { buildTreeIndex, FileTree } from './components/FileTree'
import { DEFAULT_SCAN_OPTIONS, FilterControls } from './components/FilterControls'
import { GlobManager } from './components/GlobManager'
import { SelectedQueue } from './components/SelectedQueue'
import { ExporterModal } from './components/ExporterModal'
import logoUrl from './assets/logo.png'
import './index.css'

const defaultSettings: ExportSettings = {
  outputDir: '',
  baseName: 'combined_output',
  separator: '------',
  includePaths: true,
  maxLines: 2000,
}

const SCAN_OPTIONS_STORAGE_KEY = 'context-packer.scan-options.v1'
const EXPORT_SETTINGS_STORAGE_KEY = 'context-packer.export-settings.v1'

function loadScanOptions(): ScanOptions {
  try {
    const storedValue = localStorage.getItem(SCAN_OPTIONS_STORAGE_KEY)
    const stored = JSON.parse(storedValue ?? 'null') as Partial<ScanOptions> | null
    const customExcludeGlobs = Array.isArray(stored?.customExcludeGlobs)
      ? stored.customExcludeGlobs
          .filter((item): item is string => typeof item === 'string')
          .map((item) => validateGlob(item))
          .filter((item): item is Extract<ReturnType<typeof validateGlob>, { valid: true }> => item.valid)
          .map((item) => item.pattern)
      : []
    return {
      filterHidden: typeof stored?.filterHidden === 'boolean' ? stored.filterHidden : DEFAULT_SCAN_OPTIONS.filterHidden,
      filterIgnored: typeof stored?.filterIgnored === 'boolean' ? stored.filterIgnored : DEFAULT_SCAN_OPTIONS.filterIgnored,
      filterDependencyBuild: typeof stored?.filterDependencyBuild === 'boolean' ? stored.filterDependencyBuild : DEFAULT_SCAN_OPTIONS.filterDependencyBuild,
      filterLockfiles: typeof stored?.filterLockfiles === 'boolean' ? stored.filterLockfiles : DEFAULT_SCAN_OPTIONS.filterLockfiles,
      filterBinary: typeof stored?.filterBinary === 'boolean' ? stored.filterBinary : DEFAULT_SCAN_OPTIONS.filterBinary,
      customExcludeGlobs: [...new Set(customExcludeGlobs)],
    }
  } catch {
    return { ...DEFAULT_SCAN_OPTIONS, customExcludeGlobs: [] }
  }
}

function  loadExportSettings(): ExportSettings {
  try {
    const storedValue = localStorage.getItem(EXPORT_SETTINGS_STORAGE_KEY)
    const stored = JSON.parse(storedValue ?? 'null') as Partial<ExportSettings> | null

    return {
      outputDir: typeof stored?.outputDir === 'string' ? stored.outputDir : defaultSettings.outputDir,
      baseName: typeof stored?.baseName === 'string' ? stored.baseName : defaultSettings.baseName,
      separator: typeof stored?.separator === 'string' ? stored.separator.replace(/[\r\n]/g, '') : defaultSettings.separator,
      includePaths: typeof stored?.includePaths === 'boolean' ? stored.includePaths : defaultSettings.includePaths,
      maxLines: Number.isFinite(stored?.maxLines) && Number(stored?.maxLines) > 0
        ? Math.floor(Number(stored?.maxLines))
        : defaultSettings.maxLines,
    }
  } catch {
    return { ...defaultSettings }
  }
}

export default function App() {
  const [rootPath, setRootPath] = useState('')
  const [nodes, setNodes] = useState<FileNode[]>([])
  const [scanOptions, setScanOptions] = useState<ScanOptions>(loadScanOptions)
  const [selectionTimeline, setSelectionTimeline] = useState(() => ({ current: createSelectionState(), past: [] as ReturnType<typeof createSelectionState>[] }))
  const selection = selectionTimeline.current
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
  const [globManagerOpen, setGlobManagerOpen] = useState(false)
  const [settings, setSettings] = useState<ExportSettings>(loadExportSettings)
  const scanRequestRef = useRef(0)

  const treeIndex = useMemo(() => buildTreeIndex(nodes), [nodes])
  const { selectedFiles, folderSelection } = useMemo(() => deriveSelection(nodes, selection), [nodes, selection])
  const selectedBytes = useMemo(() => selectedFiles.reduce((total, file) => total + file.size, 0), [selectedFiles])
  const ruleSummary = useMemo(() => buildRuleSummary(selection), [selection])
  const matchingFiles = useMemo(
    () => nodes.filter((node) => node.kind === 'file' && node.eligible && fuzzyMatch(`${node.name} ${node.path}`, deferredSearch)),
    [nodes, deferredSearch],
  )
  const selectionHasRules = selection.quickRules.size > 0 || selection.globRules.size > 0 || selection.folderRules.size > 0 || selection.fileOverrides.size > 0

  useEffect(() => {
    try {
      localStorage.setItem(SCAN_OPTIONS_STORAGE_KEY, JSON.stringify(scanOptions))
    } catch {
      // The current settings still work for this session when local storage is unavailable.
    }
  }, [scanOptions])

  useEffect(() => {
    try {
      localStorage.setItem(EXPORT_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Export settings remain available for this session even without persistent storage.
    }
  }, [settings])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let active = true
    listen<ScanProgress>('scan-progress', (event) => {
      if (active) setScanProgress(event.payload.visited)
    }).then((cleanup) => {
      unlisten = cleanup
      if (!active) cleanup()
    }).catch((error) => setScanError(formatError(error)))
    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let active = true
    listen<ExportProgress>('export-progress', (event) => {
      if (active) setExportProgress(event.payload)
    }).then((cleanup) => {
      unlisten = cleanup
      if (!active) cleanup()
    }).catch((error) => setExportError(formatError(error)))
    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  function updateSelection(updater: (current: ReturnType<typeof createSelectionState>) => ReturnType<typeof createSelectionState>) {
    setSelectionTimeline((timeline) => {
      const next = updater(timeline.current)
      if (next === timeline.current) return timeline
      return { current: next, past: [...timeline.past.slice(-39), timeline.current] }
    })
  }

  function undoSelection() {
    setSelectionTimeline((timeline) => {
      const previous = timeline.past[timeline.past.length - 1]
      return previous
        ? { current: previous, past: timeline.past.slice(0, -1) }
        : timeline
    })
  }

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
    if (changedFolder) {
      setSelectionTimeline({ current: clearSelection(), past: [] })
    }
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
    updateSelection((current) => setFileOverride(current, node.path, !isSelected(node, current)))
  }

  function toggleFolder(node: FileNode) {
    const state = folderSelection.get(node.path) ?? { selected: 0, eligible: 0 }
    if (state.eligible === 0) return
    const shouldSelect = state.selected !== state.eligible
    updateSelection((current) => setFolderRule(current, node.path, shouldSelect))
  }

  function toggleQuick(id: string) {
    updateSelection((current) => toggleQuickRule(current, id))
  }

  function toggleSelectionGlob(pattern: string, enabled: boolean) {
    updateSelection((current) => enabled ? addGlobRule(current, pattern) : removeGlobRule(current, pattern))
  }

  function selectMatching() {
    if (!deferredSearch.trim()) {
      updateSelection((current) => setFolderRule(current, '', true))
      return
    }
    updateSelection((current) => setManyFileOverrides(current, matchingFiles.map((file) => file.path), true))
  }

  function clearMatching() {
    if (!deferredSearch.trim()) {
      updateSelection(() => clearSelection())
      return
    }
    updateSelection((current) => setManyFileOverrides(current, matchingFiles.map((file) => file.path), false))
  }

  function removeSelected(node: FileNode) {
    updateSelection((current) => setFileOverride(current, node.path, false))
  }

  function resetSelection() {
    if (!selectionHasRules) return
    updateSelection(() => clearSelection())
  }

  function toggleExcludeGlob(pattern: string, enabled: boolean) {
    const validation = validateGlob(pattern)
    if (!validation.valid) return
    const cleanPattern = validation.pattern
    const current = scanOptions.customExcludeGlobs
    const nextGlobs = enabled
      ? [...new Set([...current, cleanPattern])]
      : current.filter((item) => item !== cleanPattern)
    changeScanOptions({ ...scanOptions, customExcludeGlobs: nextGlobs })
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
      const result = await exportFiles(rootPath, selectedFiles.map((file) => file.path), settings)
      setExportResult(result)
      setSettingsOpen(false)
    } catch (error) {
      setExportError(formatError(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-brand">
          <div className="app-brand-mark"><img src={logoUrl} alt="Context Packer logo" /></div>
          <div className="app-brand-copy">
            <div className="app-brand-title-row">
              <h1 className="app-brand-title">Context Packer</h1>
              <span className="app-brand-tag">Local workspace</span>
            </div>
            <p className="app-brand-subtitle">Shape your codebase into focused, AI-ready context.</p>
          </div>
        </div>
        <div className="header-meta">
          {scanning && <span className="header-progress"><RefreshCw className="size-3.5 spin" />Scanning {scanProgress.toLocaleString()}</span>}
          {exporting && exportProgress && <span className="header-progress"><RefreshCw className="size-3.5 spin" />Exporting {exportProgress.current}/{exportProgress.total}</span>}
          {!scanning && !exporting && <span className="header-status">{rootPath ? 'Workspace ready' : 'Ready when you are'}</span>}
          {rootPath && <button type="button" onClick={() => void rescan()} disabled={scanning} className="header-rescan" title="Rescan the current folder"><RefreshCw className="size-3.5" />Rescan</button>}
        </div>
      </header>

      <div className="workspace-grid">
        <section className="source-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-eyebrow">Workspace / 01</p>
              <h2 className="panel-title">Source explorer</h2>
              <p className="panel-description">Browse, filter and collect the files that matter.</p>
            </div>
            <div className="panel-heading-stat"><span className="status-dot" /><strong>{nodes.length.toLocaleString()}</strong> {nodes.length === 1 ? 'item' : 'items'}</div>
          </div>
          <FilterControls
            rootPath={rootPath}
            search={search}
            onSearchChange={setSearch}
            options={scanOptions}
            onOptionsChange={changeScanOptions}
            onOpenFolder={() => void openFolder()}
            onRescan={() => void rescan()}
            onManageGlobs={() => setGlobManagerOpen(true)}
            scanning={scanning}
            quickRules={selection.quickRules}
            onToggleQuickRule={toggleQuick}
          />

          <div className="source-toolbar">
            <div className="source-toolbar-meta">
              <span>{nodes.length ? <><strong>{nodes.length.toLocaleString()}</strong> nodes</> : 'No folder loaded'}</span>
              {nodes.length > 0 && <span><strong>{nodes.filter((node) => node.kind === 'file' && node.eligible).length.toLocaleString()}</strong> selectable files</span>}
              {search && <span className="source-toolbar-pill">{matchingFiles.length.toLocaleString()} search matches</span>}
            </div>
            <div className="source-toolbar-actions">
              <button type="button" onClick={selectMatching} disabled={!matchingFiles.length || scanning} className="source-toolbar-button is-primary" title="Select every eligible file matching the current search">Select matching</button>
              <button type="button" onClick={clearMatching} disabled={!matchingFiles.length || scanning} className="source-toolbar-button" title="Remove matching files from the selection">Clear matching</button>
            </div>
          </div>

          {scanError ? (
            <div className="m-4 rounded-xl border border-rose-500/20 bg-rose-500/4 px-4 py-3 text-sm text-rose-300">{scanError}</div>
          ) : (
            <FileTree
              key={rootPath}
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

        <aside className="queue-panel">
          <div className="panel-heading queue-heading">
            <div className="queue-heading-main">
              <div className="queue-heading-icon"><ClipboardList className="size-4" /></div>
              <div className="min-w-0">
                <h2 className="queue-heading-title">Selected queue</h2>
                <p className="queue-heading-subtitle">{selectedFiles.length.toLocaleString()} files selected · {ruleSummary}</p>
              </div>
            </div>
            <div className="queue-heading-actions">
              <button type="button" onClick={undoSelection} disabled={selectionTimeline.past.length === 0} className="queue-action-button" title="Undo the most recent selection change"><ArrowLeft className="size-3.5" />Undo</button>
              <button
                type="button"
                onClick={resetSelection}
                disabled={!selectionHasRules}
                className="queue-action-button is-danger"
                title="Reset all selection rules and manual overrides"
              >
                <Trash2 className="size-3.5" />Reset
              </button>
            </div>
          </div>

          <SelectedQueue
            files={selectedFiles}
            activeGlobRules={[...selection.globRules]}
            onRemove={removeSelected}
            onRemoveGlobRule={(pattern) => updateSelection((current) => removeGlobRule(current, pattern))}
          />

          <div className="export-footer">
            <div className="export-card">
              <div className="export-card-heading">
                <div className="export-card-title-wrap">
                  <FileOutput className="size-4 export-card-icon" />
                  <span className="export-card-title">Export package</span>
                </div>
                <button type="button" onClick={() => setSettingsOpen(true)} className="export-settings-button" title="Open export settings"><Settings2 className="size-4" /></button>
              </div>

              <div className="export-metrics">
                <Metric label="Files" value={selectedFiles.length.toLocaleString()} />
                <Metric label="Size" value={formatBytes(selectedBytes)} />
                <Metric label="Part limit" value={`${settings.maxLines.toLocaleString()} lines`} />
              </div>

              <div className="export-detail-list">
                <div className="export-detail"><FolderOpen className="size-3.5" /><span title={settings.outputDir}>{settings.outputDir || 'Choose an output folder'}</span></div>
                <div className="export-detail"><Gauge className="size-3.5" /><span>{settings.baseName}_partN.txt · {settings.includePaths ? 'path headers on' : 'path headers off'} · separator “{settings.separator}”</span></div>
              </div>

              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                disabled={selectedFiles.length === 0 || exporting}
                className="export-primary-button"
              >
                <ArrowDownToLine className="size-4" />Configure & export
              </button>
            </div>
          </div>

          {(exportError || exportResult) && (
            <div className="shrink-0">
              {exportError && <div className="export-message is-error">{exportError}</div>}
              {exportResult && (
                <div className="export-message is-success">
                  <div className="flex items-center gap-2 font-semibold"><Check className="size-3.5" />Export complete</div>
                  <p className="mt-1 text-emerald-300/60">{exportResult.filesWritten} source files → {exportResult.parts.length} part{exportResult.parts.length === 1 ? '' : 's'}. {exportResult.oversizedFiles.length ? `${exportResult.oversizedFiles.length} file${exportResult.oversizedFiles.length === 1 ? '' : 's'} exceeded the line target but remained intact.` : ''}</p>
                  <div className="mt-2 space-y-1">
                    {exportResult.parts.map((part) => <p key={part} className="truncate text-[0.65rem] text-emerald-300/60" title={part}>{part}</p>)}
                  </div>
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

      <GlobManager
        open={globManagerOpen}
        nodes={nodes}
        activeExcludeGlobs={scanOptions.customExcludeGlobs}
        activeSelectionGlobs={selection.globRules}
        onClose={() => setGlobManagerOpen(false)}
        onToggleSelection={toggleSelectionGlob}
        onToggleExclude={toggleExcludeGlob}
      />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
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
