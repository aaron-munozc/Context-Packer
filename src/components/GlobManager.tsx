import { BookOpen, Check, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FileNode, SavedGlob } from '@/lib/types'
import { matchesGlob, validateGlob } from '@/lib/fuzzy'

const STORAGE_KEY = 'context-packer.saved-globs.v1'

const STARTER_GLOBS: Array<Pick<SavedGlob, 'name' | 'pattern' | 'mode'>> = [
  { name: 'Source code', pattern: '**/*.{c,cc,cpp,h,hpp,cs,go,java,js,jsx,ts,tsx,py,pyi,rs,rb,php,swift,kt,vue,svelte}', mode: 'select' },
  { name: 'Tests and specs', pattern: '**/*.{test,spec}.{js,jsx,ts,tsx,py,rs}', mode: 'select' },
  { name: 'Documentation', pattern: '**/*.{md,mdx,rst,adoc,txt}', mode: 'select' },
  { name: 'Configuration files', pattern: '**/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf}', mode: 'select' },
  { name: 'Generated and minified files', pattern: '**/*.{min.js,min.css,generated.ts,generated.js}', mode: 'exclude' },
  { name: 'Build output folders', pattern: '**/{dist,build,coverage,.next,vendor}/', mode: 'exclude' },
  { name: 'Dependency folders', pattern: '**/{.git,node_modules,target,.target}/', mode: 'exclude' },
  { name: 'Common lockfiles', pattern: '**/{Cargo.lock,Gemfile.lock,Pipfile.lock,bun.lock,bun.lockb,composer.lock,go.work.sum,mix.lock,package-lock.json,pnpm-lock.yaml,poetry.lock,yarn.lock}', mode: 'exclude' },
]

function loadSavedGlobs(): SavedGlob[] {
  let primary: string | null = null
  let value: unknown
  try {
    primary = localStorage.getItem(STORAGE_KEY)
    value = JSON.parse(primary ?? '[]') as unknown
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []

  const seenRules = new Set<string>()
  const valid: SavedGlob[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<SavedGlob>
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.pattern !== 'string') continue
    if (candidate.mode !== 'select' && candidate.mode !== 'exclude') continue
    const checked = validateGlob(candidate.pattern)
    if (!checked.valid) continue
    const ruleKey = `${candidate.mode}:${checked.pattern}`
    if (seenRules.has(ruleKey)) continue
    seenRules.add(ruleKey)
    valid.push({ id: candidate.id, name: candidate.name, pattern: checked.pattern, mode: candidate.mode })
  }

  // Migration failure should not hide the valid legacy presets for this run.
  if (primary === null) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(valid)) } catch { /* kept in memory */ }
  }
  return valid
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
      setError('Could not save presets in local storage. Check the app storage settings.')
    }
  }, [saved])

  const validation = useMemo(() => validateGlob(pattern), [pattern])
  const matchingCount = useMemo(() => {
    if (!validation.valid) return 0
    return nodes.filter((node) => node.kind === 'file' && node.eligible && matchesGlob(node.path, validation.pattern)).length
  }, [nodes, validation])

  if (!open) return null

  function startNew() {
    setSelectedId('')
    setName('')
    setPattern('')
    setMode('select')
    setError('')
  }

  function loadStarter(starterIndex: string) {
    const starter = STARTER_GLOBS[Number(starterIndex)]
    if (!starter) return
    setSelectedId('')
    setName(starter.name)
    setPattern(starter.pattern)
    setMode(starter.mode)
    setError('')
  }

  function editPreset(preset: SavedGlob) {
    setSelectedId(preset.id)
    setName(preset.name)
    setPattern(preset.pattern)
    setMode(preset.mode)
    setError('')
  }

  function applyPattern() {
    if (!validation.valid) {
      setError(validation.error)
      return
    }
    const cleanPattern = validation.pattern
    const active = mode === 'select'
      ? activeSelectionGlobs.has(cleanPattern)
      : activeExcludeGlobs.includes(cleanPattern)
    if (mode === 'select') onToggleSelection(cleanPattern, !active)
    else onToggleExclude(cleanPattern, !active)
    setError('')
  }

  function savePreset() {
    const cleanName = name.trim()
    if (!cleanName) {
      setError('Give this preset a name.')
      return
    }
    if (!validation.valid) {
      setError(validation.error)
      return
    }
    const cleanPattern = validation.pattern
    const duplicate = saved.find((item) => item.id !== selectedId && item.mode === mode && item.pattern === cleanPattern)
    if (duplicate) {
      setError(`That pattern already exists as “${duplicate.name}”. Edit the existing preset instead of creating a duplicate.`)
      return
    }

    const existing = saved.find((item) => item.id === selectedId)
    if (existing && (existing.pattern !== cleanPattern || existing.mode !== mode)) {
      if (existing.mode === 'select' && activeSelectionGlobs.has(existing.pattern)) onToggleSelection(existing.pattern, false)
      if (existing.mode === 'exclude' && activeExcludeGlobs.includes(existing.pattern)) onToggleExclude(existing.pattern, false)
    }
    const id = selectedId || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
    const next: SavedGlob = { id, name: cleanName, pattern: cleanPattern, mode }
    setSaved((current) => selectedId
      ? current.map((item) => item.id === selectedId ? next : item)
      : [...current, next],
    )
    setSelectedId(id)
    setPattern(cleanPattern)
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
  const normalizedPattern = validation.valid ? validation.pattern : ''
  const active = mode === 'select'
    ? activeSelectionGlobs.has(normalizedPattern)
    : activeExcludeGlobs.includes(normalizedPattern)

  return (
    <div className="modal-backdrop fixed inset-0 z-50 grid place-items-center p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-surface glob-dialog flex max-h-[90vh] flex-col overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="glob-manager-title">
        <header className="modal-header flex items-start justify-between border-b px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-300"><Sparkles className="size-4" /></div>
            <div>
              <p className="modal-kicker">Reusable rules / library</p>
              <h2 id="glob-manager-title" className="modal-heading mt-1">Glob library</h2>
              <p className="modal-description mt-1">Apply a one-time pattern, or save it locally as a reusable preset for later.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-900 hover:text-slate-200" aria-label="Close glob manager"><X className="size-4" /></button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
          <div className="glob-library-list min-h-0 overflow-auto border-b p-4 md:border-b-0 md:border-r">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saved presets</h3>
              <button type="button" onClick={startNew} className="form-secondary-button"><Plus className="size-3.5" />New</button>
            </div>
            {saved.length === 0 ? (
              <div className="glob-empty">
                <p className="text-sm text-slate-400">No saved globs yet</p>
                <p className="mt-1 text-xs text-slate-600">Create one now, or load a starter pattern on the right.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {saved.map((preset) => {
                  const presetActive = preset.mode === 'select'
                    ? activeSelectionGlobs.has(preset.pattern)
                    : activeExcludeGlobs.includes(preset.pattern)
                  return (
                    <article key={preset.id} className={`glob-preset-card ${selectedId === preset.id ? 'is-selected' : ''}`}>
                      <div className="flex items-start gap-2">
                        <button type="button" onClick={() => editPreset(preset)} className="min-w-0 flex-1 text-left">
                          <span className="flex items-center gap-2">
                            <span className="glob-preset-name truncate">{preset.name}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-wide ${preset.mode === 'select' ? 'glob-mode-select' : 'glob-mode-exclude'}`}>{preset.mode}</span>
                          </span>
                          <code className="glob-preset-pattern mt-1 block truncate">{preset.pattern}</code>
                        </button>
                        <button type="button" onClick={() => editPreset(preset)} title="Edit preset" className="grid size-7 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-800 hover:text-slate-200"><Pencil className="size-3.5" /></button>
                        <button type="button" onClick={() => deletePreset(preset.id)} title="Delete preset" className="grid size-7 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-3.5" /></button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`text-[0.65rem] ${presetActive ? 'glob-active' : 'glob-inactive'}`}>{presetActive ? 'Active' : 'Inactive'}</span>
                        <button type="button" onClick={() => usePreset(preset)} className="form-secondary-button !px-2.5 !py-1">
                          {preset.mode === 'select' ? (presetActive ? 'Deactivate' : 'Select matches') : presetActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <div className="glob-editor-section min-h-0 overflow-auto p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{selectedPreset ? 'Edit preset' : 'Create or apply a pattern'}</h3>
              {selectedPreset && <button type="button" onClick={startNew} className="text-xs text-slate-500 hover:text-slate-200">New preset</button>}
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300"><BookOpen className="size-3.5 text-amber-300" />Starter patterns</label>
              <select defaultValue="" onChange={(event) => loadStarter(event.target.value)} className="form-control mt-2">
                <option value="">Choose a starter…</option>
                {STARTER_GLOBS.map((starter, index) => <option key={starter.name} value={index}>{starter.name} · {starter.mode === 'select' ? 'select' : 'exclude'}</option>)}
              </select>
              <p className="mt-1.5 text-[0.65rem] leading-4 text-slate-600">Loading a starter only fills the editor. Apply it immediately or save it to your own library.</p>
            </div>

            <label className="mt-4 block">
              <span className="form-label">Preset name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="React source files" className="form-control mt-1.5" />
            </label>
            <label className="mt-4 block">
              <span className="form-label">Glob pattern</span>
              <input value={pattern} onChange={(event) => { setPattern(event.target.value); setError('') }} placeholder="src/**/*.tsx" spellCheck={false} className="form-control mt-1.5 font-mono" />
              <span className="mt-1.5 block text-[0.68rem] leading-5 text-slate-600">Supports <code>*</code>, <code>**</code>, <code>?</code>, <code>[abc]</code>, <code>{'{js,ts}'}</code> and directory suffixes such as <code>vendor/</code>.</span>
            </label>
            <label className="mt-4 block">
              <span className="form-label">What should this glob do?</span>
              <select value={mode} onChange={(event) => { setMode(event.target.value as 'select' | 'exclude'); setError('') }} className="form-control mt-1.5">
                <option value="select">Select matching files</option>
                <option value="exclude">Exclude matching files from scans</option>
              </select>
            </label>

            <div className="glob-match-preview mt-4 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Matches in current scan</span>
                <span className="text-sm font-semibold tabular-nums text-slate-200">{validation.valid ? `${matchingCount.toLocaleString()} files` : 'Invalid pattern'}</span>
              </div>
              {!validation.valid ? (
                <p className="mt-1 text-[0.68rem] leading-4 text-rose-300">{validation.error}</p>
              ) : (
                <p className="mt-1 text-[0.65rem] leading-4 text-slate-600">{mode === 'exclude' ? 'Exclusion matches disappear from the tree after the scan refreshes.' : 'Only eligible text files are added to the selection.'}</p>
              )}
              {active && <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-300"><Check className="size-3.5" />This pattern is currently active</p>}
            </div>

            {error && <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">{error}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={savePreset} className="form-primary-button" disabled={!validation.valid}><Save className="size-4" />{selectedPreset ? 'Save changes' : 'Save preset'}</button>
              <button type="button" onClick={applyPattern} disabled={!validation.valid} className="form-secondary-button disabled:cursor-not-allowed">
                {active ? 'Deactivate pattern' : mode === 'select' ? 'Apply now' : 'Activate filter'}
              </button>
            </div>
            <p className="mt-4 text-[0.65rem] leading-5 text-slate-600">Applying a pattern does not save it. Saving a preset does not activate it. Saved presets stay on this device; exclusion rules also remain active in your saved filter settings.</p>
          </div>
        </div>
        <footer className="modal-footer flex items-center justify-between border-t px-5 py-3">
          <p className="text-[0.65rem] text-slate-600">Local preset library · no upload or account required</p>
          <button type="button" onClick={onClose} className="form-secondary-button">Done</button>
        </footer>
      </section>
    </div>
  )
}
