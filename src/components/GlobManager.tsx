import { Check, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FileNode, SavedGlob } from '@/lib/types'
import { matchesGlob } from '@/lib/fuzzy'

const STORAGE_KEY = 'context-forge.saved-globs.v1'

function loadSavedGlobs(): SavedGlob[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is SavedGlob => {
      return Boolean(
        item && typeof item === 'object' &&
        typeof (item as SavedGlob).id === 'string' &&
        typeof (item as SavedGlob).name === 'string' &&
        typeof (item as SavedGlob).pattern === 'string' &&
        ((item as SavedGlob).mode === 'select' || (item as SavedGlob).mode === 'exclude'),
      )
    })
  } catch {
    return []
  }
}

type Props = {
  open: boolean
  nodes: readonly FileNode[]
  activeExcludeGlobs: readonly string[]
  activeSelectionGlobs: ReadonlySet<string>
  onClose: () => void
  onToggleSelection: (pattern: string, enabled: boolean) => void
  onToggleExclude: (pattern: string, enabled: boolean) => void
}

export function GlobManager({
  open,
  nodes,
  activeExcludeGlobs,
  activeSelectionGlobs,
  onClose,
  onToggleSelection,
  onToggleExclude,
}: Props) {
  const [saved, setSaved] = useState<SavedGlob[]>(loadSavedGlobs)
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [pattern, setPattern] = useState('')
  const [mode, setMode] = useState<'select' | 'exclude'>('select')
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      setError('Could not save presets in local storage. Check browser storage settings.')
    }
  }, [saved])

  const matchingCount = useMemo(() => {
    const trimmed = pattern.trim()
    if (!trimmed) return 0
    return nodes.filter((node) => node.kind === 'file' && node.eligible && matchesGlob(node.path, trimmed)).length
  }, [nodes, pattern])

  if (!open) return null

  function startNew() {
    setSelectedId('')
    setName('')
    setPattern('')
    setMode('select')
    setError('')
  }

  function editPreset(preset: SavedGlob) {
    setSelectedId(preset.id)
    setName(preset.name)
    setPattern(preset.pattern)
    setMode(preset.mode)
    setError('')
  }

  function savePreset() {
    const cleanName = name.trim()
    const cleanPattern = pattern.trim()
    if (!cleanName || !cleanPattern) {
      setError('Give this preset a name and a glob pattern.')
      return
    }
    if (cleanPattern.startsWith('!')) {
      setError('Negated patterns are not supported. Save a positive pattern instead.')
      return
    }

    const existing = saved.find((item) => item.id === selectedId)
    if (existing && (existing.pattern !== cleanPattern || existing.mode !== mode)) {
      if (existing.mode === 'select' && activeSelectionGlobs.has(existing.pattern)) onToggleSelection(existing.pattern, false)
      if (existing.mode === 'exclude' && activeExcludeGlobs.includes(existing.pattern)) onToggleExclude(existing.pattern, false)
    }
    const id = selectedId || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`)
    const next: SavedGlob = { id, name: cleanName, pattern: cleanPattern, mode }
    setSaved((current) => selectedId
      ? current.map((item) => item.id === selectedId ? next : item)
      : [...current, next],
    )
    setSelectedId(id)
    setError('')
  }

  function deletePreset(id: string) {
    const preset = saved.find((item) => item.id === id)
    if (preset?.mode === 'select' && activeSelectionGlobs.has(preset.pattern)) onToggleSelection(preset.pattern, false)
    if (preset?.mode === 'exclude' && activeExcludeGlobs.includes(preset.pattern)) onToggleExclude(preset.pattern, false)
    setSaved((current) => current.filter((item) => item.id !== id))
    if (selectedId === id) startNew()
  }

  function usePreset(preset: SavedGlob) {
    if (preset.mode === 'select') onToggleSelection(preset.pattern, !activeSelectionGlobs.has(preset.pattern))
    else onToggleExclude(preset.pattern, !activeExcludeGlobs.includes(preset.pattern))
  }

  const selectedPreset = saved.find((item) => item.id === selectedId)
  const active = mode === 'select'
    ? activeSelectionGlobs.has(pattern.trim())
    : activeExcludeGlobs.includes(pattern.trim())

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/60" role="dialog" aria-modal="true" aria-labelledby="glob-manager-title">
        <header className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-300"><Sparkles className="size-4" /></div>
            <div>
              <h2 id="glob-manager-title" className="text-base font-semibold text-slate-100">Glob library</h2>
              <p className="mt-1 text-xs text-slate-500">Save reusable patterns to select files or exclude them from scans. Presets stay on this device.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-900 hover:text-slate-200" aria-label="Close glob manager"><X className="size-4" /></button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
          <div className="min-h-0 overflow-auto border-b border-slate-800 p-4 md:border-b-0 md:border-r">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saved presets</h3>
              <button type="button" onClick={startNew} className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:bg-slate-900"><Plus className="size-3.5" />New</button>
            </div>
            {saved.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center">
                <p className="text-sm text-slate-400">No saved globs yet</p>
                <p className="mt-1 text-xs text-slate-600">Create a preset on the right. Examples: <code>**/*.tsx</code>, <code>src/**</code>.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {saved.map((preset) => {
                  const presetActive = preset.mode === 'select'
                    ? activeSelectionGlobs.has(preset.pattern)
                    : activeExcludeGlobs.includes(preset.pattern)
                  return (
                    <article key={preset.id} className={`rounded-xl border p-3 transition ${selectedId === preset.id ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-slate-800 bg-slate-900/30'}`}>
                      <div className="flex items-start gap-2">
                        <button type="button" onClick={() => editPreset(preset)} className="min-w-0 flex-1 text-left">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-slate-200">{preset.name}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-wide ${preset.mode === 'select' ? 'bg-indigo-500/10 text-indigo-300' : 'bg-amber-500/10 text-amber-300'}`}>{preset.mode}</span>
                          </span>
                          <code className="mt-1 block truncate text-xs text-slate-500">{preset.pattern}</code>
                        </button>
                        <button type="button" onClick={() => editPreset(preset)} title="Edit preset" className="grid size-7 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-800 hover:text-slate-200"><Pencil className="size-3.5" /></button>
                        <button type="button" onClick={() => deletePreset(preset.id)} title="Delete preset" className="grid size-7 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-3.5" /></button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`text-[0.65rem] ${presetActive ? 'text-emerald-300' : 'text-slate-600'}`}>{presetActive ? 'Active' : 'Inactive'}</span>
                        <button type="button" onClick={() => usePreset(preset)} className="rounded-md border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700 hover:bg-slate-800">
                          {preset.mode === 'select' ? (presetActive ? 'Deactivate' : 'Select matches') : presetActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-auto p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{selectedPreset ? 'Edit preset' : 'Create preset'}</h3>
              {selectedPreset && <button type="button" onClick={startNew} className="text-xs text-slate-500 hover:text-slate-200">New preset</button>}
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-slate-400">Preset name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="React source files" className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500/60" />
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-slate-400">Glob pattern</span>
              <input value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="src/**/*.tsx" spellCheck={false} className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 font-mono text-sm text-slate-100 outline-none focus:border-indigo-500/60" />
              <span className="mt-1.5 block text-[0.68rem] leading-5 text-slate-600">Supports <code>*</code>, <code>**</code>, <code>?</code>, <code>[abc]</code> and <code>{'{js,ts}'}</code>. A filename-only pattern applies at any depth.</span>
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-slate-400">What should this glob do?</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as 'select' | 'exclude')} className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60">
                <option value="select">Select matching files</option>
                <option value="exclude">Exclude matching files from scans</option>
              </select>
            </label>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/55 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Matches in current scan</span>
                <span className="text-sm font-semibold tabular-nums text-slate-200">{matchingCount.toLocaleString()} files</span>
              </div>
              <p className="mt-1 text-[0.65rem] leading-4 text-slate-600">Excluded files are not present in the current tree, so their preview count can be lower while the rule is active.</p>
              {active && <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-300"><Check className="size-3.5" />This pattern is currently active</p>}
            </div>

            {error && <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">{error}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={savePreset} className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"><Save className="size-4" />{selectedPreset ? 'Save changes' : 'Save preset'}</button>
              <button
                type="button"
                onClick={() => mode === 'select' ? onToggleSelection(pattern.trim(), !activeSelectionGlobs.has(pattern.trim())) : onToggleExclude(pattern.trim(), !activeExcludeGlobs.includes(pattern.trim()))}
                disabled={!pattern.trim()}
                className="rounded-lg border border-slate-700 px-3.5 py-2.5 text-sm text-slate-200 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mode === 'select' ? (active ? 'Deactivate selection rule' : 'Select matches') : active ? 'Deactivate filter' : 'Activate filter'}
              </button>
            </div>
            <p className="mt-4 text-[0.65rem] leading-5 text-slate-600">Selection presets add a reusable selection rule. Exclusion presets rescan the folder and persist as active scan filters. Active selection-glob rules can also be removed directly from the selected queue.</p>
          </div>
        </div>
        <footer className="flex items-center justify-between border-t border-slate-800 px-5 py-3">
          <p className="text-[0.65rem] text-slate-600">Stored locally in this app's WebView storage.</p>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-900">Done</button>
        </footer>
      </section>
    </div>
  )
}
