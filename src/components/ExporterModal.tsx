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
    <div className="modal-backdrop fixed inset-0 z-50 grid place-items-center p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !exporting) onClose() }}>
      <div className="modal-surface export-modal max-h-[92vh] w-full max-w-xl overflow-auto" role="dialog" aria-modal="true" aria-labelledby="export-settings-title">
        <div className="modal-header flex items-start justify-between border-b px-5 py-4">
          <div>
            <p className="modal-kicker">Delivery / configure</p>
            <p id="export-settings-title" className="modal-heading mt-1">Export settings</p>
            <p className="modal-description mt-1">Build a clean, non-truncating context set from {selectedCount.toLocaleString()} selected files.</p>
          </div>
          <button type="button" onClick={onClose} disabled={exporting} aria-label="Close export settings" className="form-secondary-button !h-8 !w-8 !p-0">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <label className="block">
            <span className="form-label">Output folder</span>
            <div className="mt-2 flex gap-2">
              <input
                value={settings.outputDir}
                onChange={(event) => onChange({ ...settings, outputDir: event.target.value })}
                className="form-control min-w-0 flex-1"
                placeholder="C:\Projects\MyProject"
              />
              <button type="button" onClick={onChooseFolder} className="form-secondary-button shrink-0">
                <FolderOpen className="size-4" />
                Browse
              </button>
            </div>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="form-label">Base name</span>
              <input
                value={settings.baseName}
                onChange={(event) => onChange({ ...settings, baseName: event.target.value })}
                className="form-control mt-2"
                placeholder="combined_output"
              />
            </label>
            <label className="block">
              <span className="form-label">Max source lines / part</span>
              <input
                type="number"
                min={1}
                step={100}
                value={settings.maxLines}
                onChange={(event) => onChange({ ...settings, maxLines: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
                className="form-control mt-2"
              />
            </label>
          </div>

          <label className="block">
            <span className="form-label">Separator</span>
            <input
              value={settings.separator}
              onChange={(event) => onChange({ ...settings, separator: event.target.value.replace(/[\r\n]/g, '') })}
              className="form-control mt-2 font-mono"
              placeholder="------"
            />
          </label>

          <button
            type="button"
            onClick={() => onChange({ ...settings, includePaths: !settings.includePaths })}
            aria-pressed={settings.includePaths}
            className="export-path-toggle flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left"
          >
            <span className={`filter-toggle-track ${settings.includePaths ? 'is-on' : ''}`}>
              <span className="filter-toggle-knob" />
            </span>
            <span>
              <span className="block text-xs font-semibold text-slate-100">Include relative file paths as headers</span>
              <span className="mt-1 block text-[10px] text-slate-400">Example: <code className="text-slate-500">[src/main.rs]</code></span>
            </span>
          </button>

          <div className="form-note flex gap-2 rounded-xl px-3 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-400/70" />
            <p>
              A source file is always written in full. When the next complete block would exceed the limit, a new part starts first. A single file larger than the limit is allowed to exceed it rather than being split.
            </p>
          </div>
        </div>

        <div className="modal-footer flex items-center justify-end gap-2 border-t px-5 py-4">
          <button type="button" onClick={onClose} disabled={exporting} className="form-secondary-button disabled:opacity-30">
            Cancel
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting || selectedCount === 0 || !valid}
            className="form-primary-button disabled:cursor-not-allowed"
          >
            {exporting ? 'Exporting…' : 'Export context'}
          </button>
        </div>
      </div>
    </div>
  )
}
