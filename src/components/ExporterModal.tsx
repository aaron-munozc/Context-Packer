import { FolderOpen, Info, X } from 'lucide-react'
import type { ExportSettings } from '@/lib/types'

export function ExporterModal({
  open,
  settings,
  onChange,
  onChooseFolder,
  onClose,
  onExport,
  exporting,
  selectedCount,
}: {
  open: boolean
  settings: ExportSettings
  onChange: (settings: ExportSettings) => void
  onChooseFolder: () => void
  onClose: () => void
  onExport: () => void
  exporting: boolean
  selectedCount: number
}) {
  if (!open) return null

  const valid = Boolean(settings.outputDir.trim() && settings.baseName.trim() && settings.separator.trim() && settings.maxLines > 0)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !exporting) onClose() }}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="export-settings-title">
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <p id="export-settings-title" className="text-base font-semibold text-slate-100">Export settings</p>
            <p className="mt-1 text-xs text-slate-500">Build a clean, non-truncating context set from {selectedCount.toLocaleString()} selected files.</p>
          </div>
          <button type="button" onClick={onClose} disabled={exporting} aria-label="Close export settings" className="grid size-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-900 hover:text-slate-300 disabled:opacity-30">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Output folder</span>
            <div className="mt-2 flex gap-2">
              <input
                value={settings.outputDir}
                onChange={(event) => onChange({ ...settings, outputDir: event.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
                placeholder="C:\Projects\MyProject"
              />
              <button type="button" onClick={onChooseFolder} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-slate-300 hover:border-slate-700 hover:text-slate-100">
                <FolderOpen className="size-4" />
                Browse
              </button>
            </div>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Base name</span>
              <input
                value={settings.baseName}
                onChange={(event) => onChange({ ...settings, baseName: event.target.value })}
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
                placeholder="combined_output"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Max source lines / part</span>
              <input
                type="number"
                min={1}
                step={100}
                value={settings.maxLines}
                onChange={(event) => onChange({ ...settings, maxLines: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Separator</span>
            <input
              value={settings.separator}
              onChange={(event) => onChange({ ...settings, separator: event.target.value.replace(/[\r\n]/g, '') })}
              className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 font-mono text-sm text-slate-200 outline-none focus:border-indigo-500/60"
              placeholder="------"
            />
          </label>

          <button
            type="button"
            onClick={() => onChange({ ...settings, includePaths: !settings.includePaths })}
            aria-pressed={settings.includePaths}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3 text-left hover:border-slate-700"
          >
            <span className={`relative h-5 w-9 rounded-full transition ${settings.includePaths ? 'bg-indigo-500' : 'bg-slate-800'}`}>
              <span className={`absolute top-0.5 size-4 rounded-full bg-white transition ${settings.includePaths ? 'left-4' : 'left-0.5'}`} />
            </span>
            <span>
              <span className="block text-sm font-medium text-slate-200">Include relative file paths as headers</span>
              <span className="mt-0.5 block text-xs text-slate-600">Example: <code className="text-slate-500">[src/main.rs]</code></span>
            </span>
          </button>

          <div className="flex gap-2 rounded-xl border border-amber-500/10 bg-amber-500/4 px-3 py-3 text-xs leading-5 text-slate-500">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-400/70" />
            <p>
              A source file is always written in full. When the next complete block would exceed the limit, a new part starts first. A single file larger than the limit is allowed to exceed it rather than being split.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
          <button type="button" onClick={onClose} disabled={exporting} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-900 hover:text-slate-300 disabled:opacity-30">
            Cancel
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting || selectedCount === 0 || !valid}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? 'Exporting…' : 'Export context'}
          </button>
        </div>
      </div>
    </div>
  )
}
