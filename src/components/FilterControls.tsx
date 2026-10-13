import { ChevronDown, Eye, FileCog, FolderOpen, GitBranch, Search, SlidersHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ScanOptions } from '@/lib/types'
import { QUICK_FILTERS } from '@/lib/selection'

const defaultOptions: ScanOptions = {
  showHidden: false,
  showIgnored: false,
  showExcluded: false,
  showLockfiles: false,
}

type Props = {
  rootPath: string
  search: string
  onSearchChange: (value: string) => void
  options: ScanOptions
  onOptionsChange: (value: ScanOptions) => void
  onOpenFolder: () => void
  onRescan: () => void
  scanning: boolean
  quickRules: Set<string>
  onToggleQuickRule: (id: string) => void
}

export function FilterControls({
  rootPath,
  search,
  onSearchChange,
  options,
  onOptionsChange,
  onOpenFolder,
  onRescan,
  scanning,
  quickRules,
  onToggleQuickRule,
}: Props) {
  const [showMenu, setShowMenu] = useState(false)

  function updateOption(key: keyof ScanOptions) {
    const next = { ...options, [key]: !options[key] }
    onOptionsChange(next)
  }

  return (
    <div className="space-y-3 border-b border-slate-800/80 px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenFolder}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-800"
        >
          <FolderOpen className="size-4" />
          Open Folder
        </button>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Filter by filename or path…"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/10"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((value) => !value)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
              showMenu || options.showHidden || options.showIgnored || options.showExcluded || options.showLockfiles
                ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-slate-100'
            }`}
            title="Visibility and exclusion controls"
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden xl:inline">View</span>
            <ChevronDown className="size-3.5" />
          </button>

          {showMenu && (
            <>
              <button
                type="button"
                aria-label="Close view menu"
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/30">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Visibility</p>
                    <p className="text-xs text-slate-500">Changing these options rescans the folder.</p>
                  </div>
                  <FileCog className="size-4 text-slate-500" />
                </div>
                <div className="space-y-1">
                  <ToggleRow icon={<Eye className="size-4" />} label="Show hidden files" checked={options.showHidden} onChange={() => updateOption('showHidden')} />
                  <ToggleRow icon={<GitBranch className="size-4" />} label="Show Git-ignored files" checked={options.showIgnored} onChange={() => updateOption('showIgnored')} />
                  <ToggleRow icon={<FolderOpen className="size-4" />} label="Show dependency / build folders" checked={options.showExcluded} onChange={() => updateOption('showExcluded')} />
                  <ToggleRow icon={<FileCog className="size-4" />} label="Show lockfiles" checked={options.showLockfiles} onChange={() => updateOption('showLockfiles')} />
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
                  <button
                    type="button"
                    onClick={() => onOptionsChange(defaultOptions)}
                    className="rounded-md px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                  >
                    Defaults
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      onRescan()
                    }}
                    disabled={scanning}
                    className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
                  >
                    Rescan now
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        <span className="shrink-0 text-[0.7rem] font-medium uppercase tracking-wider text-slate-600">Quick select</span>
        {QUICK_FILTERS.map((filter) => {
          const active = quickRules.has(filter.id)
          return (
            <button
              type="button"
              key={filter.id}
              onClick={() => onToggleQuickRule(filter.id)}
              title={active ? `Remove ${filter.hint} rule` : `Select all ${filter.hint}`}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200 shadow-sm shadow-indigo-950/30'
                  : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {active ? '✓ ' : ''}{filter.label}
            </button>
          )
        })}
        <div className="ml-auto hidden min-w-0 max-w-72 items-center gap-2 text-xs text-slate-600 2xl:flex">
          <span className="truncate" title={rootPath || 'No folder selected'}>
            {rootPath || 'Choose a folder to begin'}
          </span>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: ReactNode
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-900"
    >
      <span className="text-slate-500">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-indigo-500' : 'bg-slate-800'}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white transition ${checked ? 'left-4' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
