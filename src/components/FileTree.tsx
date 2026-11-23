import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Braces,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ExcludeReason, FileNode } from '@/lib/types'
import { fuzzyMatch } from '@/lib/fuzzy'
import type { FolderSelection, SelectionState } from '@/lib/selection'
import { isSelected, deriveSelection } from '@/lib/selection'

export type FileTreeIndex = {
  byPath: Map<string, FileNode>
  children: Map<string, FileNode[]>
}

export function buildTreeIndex(nodes: readonly FileNode[]): FileTreeIndex {
  const byPath = new Map(nodes.map((node) => [node.path, node]))
  const children = new Map<string, FileNode[]>()

  for (const node of nodes) {
    if (node.path === '') continue
    const parent = node.parent ?? ''
    const list = children.get(parent) ?? []
    list.push(node)
    children.set(parent, list)
  }

  for (const list of children.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })
  }

  return { byPath, children }
}

type Props = {
  nodes: readonly FileNode[]
  treeIndex: FileTreeIndex
  selection: SelectionState
  onToggleFile: (node: FileNode) => void
  onToggleFolder: (node: FileNode) => void
  search: string
  emptyMessage: string
}

type VisibleRow = {
  node: FileNode
  depth: number
}

export function FileTree({
  nodes,
  treeIndex,
  selection,
  onToggleFile,
  onToggleFolder,
  search,
  emptyMessage,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<string[]>([''])

  const { folderSelection } = useMemo(() => deriveSelection(nodes, selection), [nodes, selection])

  const visibleRows = useMemo(() => {
    const query = search.trim()
    const matching = new Set<string>()

    if (query) {
      for (const node of nodes) {
        if (fuzzyMatch(`${node.name} ${node.path}`, query)) {
          matching.add(node.path)
        }
      }
      for (const path of [...matching]) {
        let current = treeIndex.byPath.get(path)?.parent ?? null
        while (current !== null) {
          matching.add(current)
          if (!current) break
          current = treeIndex.byPath.get(current)?.parent ?? null
        }
      }
    }

    const autoExpanded = query
      ? new Set([...matching].filter((path) => treeIndex.byPath.get(path)?.kind === 'dir'))
      : new Set<string>()
    const expandedSet = new Set([...expanded, ...autoExpanded])
    const rows: VisibleRow[] = []

    function visit(parent: string, depth: number) {
      const children = treeIndex.children.get(parent) ?? []
      for (const node of children) {
        if (query && !matching.has(node.path)) continue
        rows.push({ node, depth })
        if (node.kind === 'dir' && expandedSet.has(node.path)) {
          visit(node.path, depth + 1)
        }
      }
    }

    const root = treeIndex.byPath.get('')
    if (root && (!query || matching.has(root.path))) {
      rows.push({ node: root, depth: 0 })
      if (expandedSet.has('')) visit('', 1)
    } else {
      visit('', 0)
    }

    return rows
  }, [nodes, search, treeIndex, expanded])

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 34,
    overscan: 24,
  })

  function toggleExpanded(path: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return [...next]
    })
  }

  return (
    <div ref={scrollRef} className="file-tree-scroll">
      {visibleRows.length === 0 ? (
        <div className="tree-empty-state">
          <div>
            <p className="tree-empty-title">{emptyMessage}</p>
            <p className="tree-empty-hint">Try clearing the search or changing visibility filters.</p>
          </div>
        </div>
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const { node, depth } = visibleRows[virtualRow.index]
            if (!node) return null
            const state = node.kind === 'dir' ? folderState(folderSelection, node.path) : undefined
            const selected = node.kind === 'file' ? isSelected(node, selection) : state?.checked ?? false
            const selectable = node.kind === 'file' ? node.eligible : (folderSelection.get(node.path)?.eligible ?? 0) > 0
            return (
              <div
                key={node.path || '__root__'}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute left-0 right-0 h-[34px] px-1"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <TreeRow
                  node={node}
                  depth={depth}
                  checked={selected}
                  indeterminate={Boolean(state?.indeterminate)}
                  selectable={selectable}
                  expanded={expanded.includes(node.path)}
                  onToggle={() => {
                    if (node.kind === 'dir') toggleExpanded(node.path)
                    else onToggleFile(node)
                  }}
                  onToggleSelection={() => {
                    if (node.kind === 'dir') onToggleFolder(node)
                    else onToggleFile(node)
                  }}
                  onToggleExpand={() => toggleExpanded(node.path)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function folderState(map: Map<string, FolderSelection>, path: string) {
  const state = map.get(path) ?? { selected: 0, eligible: 0 }
  return {
    checked: state.eligible > 0 && state.selected === state.eligible,
    indeterminate: state.selected > 0 && state.selected < state.eligible,
  }
}

function TreeRow({
  node,
  depth,
  checked,
  indeterminate,
  selectable,
  expanded,
  onToggle,
  onToggleSelection,
  onToggleExpand,
}: {
  node: FileNode
  depth: number
  checked: boolean
  indeterminate: boolean
  selectable: boolean
  expanded: boolean
  onToggle: () => void
  onToggleSelection: () => void
  onToggleExpand: () => void
}) {
  const checkboxRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate
  }, [indeterminate])

  const childrenExist = node.kind === 'dir'
  const muted = node.ignored || node.excluded

  return (
    <div
      className={`file-tree-row group ${selectable ? 'is-selectable' : ''} ${node.path === '' ? 'is-root font-medium' : ''} ${muted ? 'is-muted' : ''}`}
      style={{ paddingLeft: `${0.35 + depth * 0.9}rem` }}
      onClick={selectable ? onToggle : undefined}
      title={node.path || node.name}
    >
      {childrenExist ? (
        <button
          type="button"
          className="tree-expand-button mr-1"
          onClick={(event) => {
            event.stopPropagation()
            onToggleExpand()
          }}
          aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      ) : (
        <span className="mr-1 size-5" />
      )}

      <input
        ref={checkboxRef}
        type="checkbox"
        checked={checked}
        disabled={!selectable}
        onChange={() => undefined}
        onClick={(event) => {
          event.stopPropagation()
          if (selectable) onToggleSelection()
        }}
        className="tree-checkbox"
        aria-label={node.kind === 'dir' ? `Select folder ${node.name}` : `Select ${node.name}`}
      />

      <NodeIcon node={node} expanded={expanded} />
      <span className="tree-node-name">
        {node.name}
      </span>

      {node.ignored && <Badge>ignored</Badge>}
      {node.excluded && <Badge>{formatExcludeReason(node.excludedReason)}</Badge>}
      {node.kind === 'file' && !node.eligible && <Badge>not exportable</Badge>}
      {node.kind === 'file' && node.size > 0 && (
        <span className="tree-node-size hidden group-hover:inline">
          {formatBytes(node.size)}
        </span>
      )}
    </div>
  )
}

function formatExcludeReason(reason: ExcludeReason | null): string {
  switch (reason) {
    case 'dependency-build':
      return 'dependency / build'
    case 'lockfile':
      return 'lockfile'
    case 'binary':
      return 'binary'
    default:
      return 'excluded'
  }
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="tree-node-badge">{children}</span>
}

function NodeIcon({ node, expanded }: { node: FileNode; expanded: boolean }) {
  if (node.kind === 'dir') {
    return expanded ? <FolderOpen className="size-4 shrink-0 tree-icon-folder" /> : <Folder className="size-4 shrink-0 tree-icon-folder" />
  }

  const ext = node.extension?.toLowerCase()
  const className = 'size-4 shrink-0'
  if (ext === 'py') return <FileCode2 className={`${className} tree-icon-code`} />
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext ?? '')) return <Braces className={`${className} tree-icon-code`} />
  if (['json', 'jsonc', 'yaml', 'yml', 'toml'].includes(ext ?? '')) return <FileJson className={`${className} tree-icon-data`} />
  if (ext === 'rs') return <FileCode2 className={`${className} tree-icon-markup`} />
  if (['html', 'htm', 'css', 'scss', 'vue', 'svelte'].includes(ext ?? '')) return <FileCode2 className={`${className} tree-icon-markup`} />
  return <FileText className={`${className} tree-icon-generic`} />
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
