import {
  ChevronDown,
  EyeOff,
  FileCog,
  FileText,
  FolderOpen,
  GitBranch,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ScanOptions } from '@/lib/types'
import { QUICK_FILTERS } from '@/lib/selection'

export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  filterHidden: true,
  filterIgnored: true,
  filterDependencyBuild: true,
  filterLockfiles: true,
  filterBinary: true,
  customExcludeGlobs: [],
}

type Props = {
  rootPath: string
  search: string
  onSearchChange: (value: string) => void
  options: ScanOptions
  onOptionsChange: (value: ScanOptions) => void
  onOpenFolder: () => void
  onRescan: () => void
  onManageGlobs: () => void
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
  onManageGlobs,
  scanning,
  quickRules,
  onToggleQuickRule,
}: Props) {
  const [showMenu, setShowMenu] = useState(false)

  function updateOption(key: keyof Omit<ScanOptions, 'customExcludeGlobs'>) {
    onOptionsChange({ ...options, [key]: !options[key] })
  }

  const filtersActive = options.filterHidden || options.filterIgnored || options.filterDependencyBuild || options.filterLockfiles || options.filterBinary || options.customExcludeGlobs.length > 0

  return (
    <div className="filter-controls">
      <div className="filter-main-row">
        <button
          type="button"
          onClick={onOpenFolder}
          className="filter-open-button"
        >
          <FolderOpen className="size-4" />
          Open folder
        </button>

        <div className="filter-search-wrap">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Find files by name or path…"
            aria-label="Search files by name or path"
            className="filter-search"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="filter-clear-search"
            >
              Clear
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onManageGlobs}
          className="filter-glob-button"
          title="Save, edit and apply reusable glob patterns"
        >
          <Sparkles className="size-4" />
          <span className="hidden lg:inline">Globs</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((value) => !value)}
            aria-expanded={showMenu}
            className={`filter-menu-button ${showMenu || filtersActive ? 'is-active' : ''}`}
            title="Default filters and visibility controls"
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden xl:inline">Filters</span>
            <ChevronDown className="size-3.5" />
          </button>

          {showMenu && (
            <>
              <button
                type="button"
                aria-label="Close filter menu"
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setShowMenu(false)}
              />
              <div className="filter-menu-popover">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="filter-menu-title">Default filters</p>
                    <p className="filter-menu-hint">Turn each exclusion on or off, then rescan.</p>
                  </div>
                  <FileCog className="size-4 text-slate-500" />
                </div>
                <div className="space-y-1">
                  <ToggleRow icon={<EyeOff className="size-4" />} label="Exclude hidden / dotfiles" hint=".env, .git, .config" checked={options.filterHidden} onChange={() => updateOption('filterHidden')} />
                  <ToggleRow icon={<GitBranch className="size-4" />} label="Exclude Git-ignored files" hint="Respects .gitignore and global Git rules" checked={options.filterIgnored} onChange={() => updateOption('filterIgnored')} />
                  <ToggleRow icon={<FolderOpen className="size-4" />} label="Exclude dependency / build folders" hint="node_modules, target, .git" checked={options.filterDependencyBuild} onChange={() => updateOption('filterDependencyBuild')} />
                  <ToggleRow icon={<FileText className="size-4" />} label="Exclude lockfiles" hint="Cargo.lock, package-lock.json, etc." checked={options.filterLockfiles} onChange={() => updateOption('filterLockfiles')} />
                  <ToggleRow icon={<FileCog className="size-4" />} label="Exclude binary / media files" hint="Images, archives, executables, audio…" checked={options.filterBinary} onChange={() => updateOption('filterBinary')} />
                </div>
                <div className="filter-menu-note mt-3">
                  {options.customExcludeGlobs.length > 0
                    ? `${options.customExcludeGlobs.length} custom exclusion ${options.customExcludeGlobs.length === 1 ? 'pattern is' : 'patterns are'} active.`
                    : 'No custom exclusion patterns are active.'}
                  {' '}Manage reusable patterns with the Globs button. To replace a built-in folder or lockfile list, turn that filter off and create your own exclusion glob.
                </div>
                <div className="filter-menu-footer">
                  <button
                    type="button"
                    onClick={() => onOptionsChange({ ...DEFAULT_SCAN_OPTIONS, customExcludeGlobs: options.customExcludeGlobs })}
                    className="filter-menu-reset"
                  >
                    Reset defaults
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      onRescan()
                    }}
                    disabled={scanning}
                    className="filter-menu-rescan"
                  >
                    {scanning ? 'Scanning…' : 'Rescan now'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="quick-select-row">
        <span className="quick-select-label">Quick select</span>
        {QUICK_FILTERS.map((filter) => {
          const active = quickRules.has(filter.id)
          return (
            <button
              type="button"
              key={filter.id}
              onClick={() => onToggleQuickRule(filter.id)}
              title={active ? `Remove ${filter.hint} selection rule` : `Select all ${filter.hint}`}
              aria-pressed={active}
              className={`quick-select-chip ${active ? 'is-active' : ''}`}
            >
              {active ? '✓ ' : ''}{filter.label}
            </button>
          )
        })}
        <div className="quick-select-path">
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
  hint,
  checked,
  onChange,
}: {
  icon: ReactNode
  label: string
  hint: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="filter-toggle-row"
    >
      <span className="text-slate-400">{icon}</span>
      <span className="filter-toggle-copy">
        <span className="filter-toggle-label">{label}</span>
        <span className="filter-toggle-hint">{hint}</span>
      </span>
      <span className={`filter-toggle-track ${checked ? 'is-on' : ''}`}>
        <span className="filter-toggle-knob" />
      </span>
    </button>
  )
}
