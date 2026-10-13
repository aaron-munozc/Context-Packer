import type { FileNode, QuickFilter } from '../types'

export type SelectionState = {
  quickRules: Set<string>
  folderRules: Map<string, boolean>
  fileOverrides: Map<string, boolean>
}

export type FolderSelection = {
  selected: number
  eligible: number
}

export const QUICK_FILTERS: readonly QuickFilter[] = [
  {
    id: 'python',
    label: 'Python',
    hint: '*.py',
    extensions: ['py'],
  },
  {
    id: 'js-ts',
    label: 'JS / TS',
    hint: '*.js · *.ts · *.jsx · *.tsx',
    extensions: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
  },
  {
    id: 'rust',
    label: 'Rust',
    hint: '*.rs',
    extensions: ['rs'],
  },
  {
    id: 'web',
    label: 'Web',
    hint: '*.css · *.html · *.vue · *.svelte',
    extensions: ['css', 'scss', 'html', 'htm', 'vue', 'svelte'],
  },
  {
    id: 'data',
    label: 'Data',
    hint: '*.json · *.yaml · *.toml',
    extensions: ['json', 'jsonc', 'yaml', 'yml', 'toml'],
  },
]

export function createSelectionState(): SelectionState {
  return {
    quickRules: new Set(),
    folderRules: new Map(),
    fileOverrides: new Map(),
  }
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.?\//, '').replace(/\/$/, '')
}

function parentPaths(path: string): string[] {
  const parts = normalize(path).split('/').filter(Boolean)
  const result: string[] = []
  for (let i = parts.length - 1; i > 0; i -= 1) {
    result.push(parts.slice(0, i).join('/'))
  }
  result.push('')
  return result
}

function getExtension(node: FileNode): string {
  return node.extension?.toLowerCase() ?? ''
}

function quickFilterMatches(node: FileNode, rule: QuickFilter): boolean {
  return rule.extensions.includes(getExtension(node))
}

function getQuickRuleForNode(node: FileNode): QuickFilter | undefined {
  return QUICK_FILTERS.find(
    (rule) => node.kind === 'file' && rule.extensions.includes(getExtension(node)),
  )
}

export function isSelected(node: FileNode, state: SelectionState): boolean {
  if (node.kind !== 'file' || !node.eligible) return false

  const override = state.fileOverrides.get(node.path)
  if (override !== undefined) return override

  for (const parent of parentPaths(node.path)) {
    const folderRule = state.folderRules.get(parent)
    if (folderRule !== undefined) return folderRule
  }

  const rule = getQuickRuleForNode(node)
  return rule ? state.quickRules.has(rule.id) : false
}

export function toggleQuickRule(state: SelectionState, ruleId: string): SelectionState {
  const quickRules = new Set(state.quickRules)
  if (quickRules.has(ruleId)) quickRules.delete(ruleId)
  else quickRules.add(ruleId)
  return { ...state, quickRules }
}

export function setFileOverride(
  state: SelectionState,
  path: string,
  value: boolean,
): SelectionState {
  const fileOverrides = new Map(state.fileOverrides)
  fileOverrides.set(path, value)
  return { ...state, fileOverrides }
}

export function setFolderRule(
  state: SelectionState,
  path: string,
  value: boolean,
): SelectionState {
  const folderRules = new Map(state.folderRules)
  folderRules.set(normalize(path), value)
  return { ...state, folderRules }
}

export function countQuickRuleMatches(nodes: readonly FileNode[], ruleId: string): number {
  const rule = QUICK_FILTERS.find((candidate) => candidate.id === ruleId)
  return rule ? nodes.filter((node) => node.kind === 'file' && node.eligible && quickFilterMatches(node, rule)).length : 0
}

export function deriveSelection(nodes: readonly FileNode[], state: SelectionState) {
  const selectedFiles: FileNode[] = []
  const folderSelection = new Map<string, FolderSelection>()

  for (const node of nodes) {
    if (node.kind !== 'file' || !node.eligible) continue

    const selected = isSelected(node, state)
    if (selected) selectedFiles.push(node)

    let parent = node.parent
    while (parent !== null) {
      const current = folderSelection.get(parent) ?? { selected: 0, eligible: 0 }
      folderSelection.set(parent, {
        selected: current.selected + (selected ? 1 : 0),
        eligible: current.eligible + 1,
      })
      if (!parent) break
      const next = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : ''
      parent = next === parent ? null : next
    }
  }

  selectedFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  return { selectedFiles, folderSelection }
}

export function clearSelection(): SelectionState {
  return createSelectionState()
}

export function buildRuleSummary(state: SelectionState): string {
  const quick = state.quickRules.size
  const folder = state.folderRules.size
  const overrides = state.fileOverrides.size
  const parts: string[] = []
  if (quick) parts.push(`${quick} extension ${quick === 1 ? 'rule' : 'rules'}`)
  if (folder) parts.push(`${folder} folder ${folder === 1 ? 'rule' : 'rules'}`)
  if (overrides) parts.push(`${overrides} manual ${overrides === 1 ? 'override' : 'overrides'}`)
  return parts.length ? parts.join(' · ') : 'No selection rules'
}
