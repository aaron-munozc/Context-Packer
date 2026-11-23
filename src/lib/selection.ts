import type { FileNode, QuickFilter } from '@/lib/types'
import { matchesGlob, validateGlob } from '@/lib/fuzzy'

export type SelectionState = {
  quickRules: Set<string>
  folderRules: Map<string, boolean>
  fileOverrides: Map<string, boolean>
  globRules: Set<string>
}

export type FolderSelection = {
  selected: number
  eligible: number
}

const CONFIG_FILE_NAMES = new Set([
  '.editorconfig', '.gitattributes', '.gitignore', '.npmrc', '.nvmrc', '.prettierrc', '.eslintrc',
  'dockerfile', 'makefile', 'justfile',
])

export const QUICK_FILTERS: readonly QuickFilter[] = [
  { id: 'python', label: 'Python', hint: '*.py', extensions: ['py', 'pyi'] },
  { id: 'js-ts', label: 'JS / TS', hint: '*.js · *.ts · *.jsx · *.tsx', extensions: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts'] },
  { id: 'rust', label: 'Rust', hint: '*.rs', extensions: ['rs'] },
  { id: 'web', label: 'Web', hint: '*.css · *.html · *.vue · *.svelte', extensions: ['css', 'scss', 'sass', 'less', 'html', 'htm', 'vue', 'svelte'] },
  { id: 'data', label: 'Data', hint: '*.json · *.yaml · *.toml', extensions: ['json', 'jsonc', 'yaml', 'yml', 'toml', 'xml'] },
  { id: 'docs', label: 'Docs', hint: '*.md · *.mdx · *.txt', extensions: ['md', 'mdx', 'txt', 'rst', 'adoc'] },
  { id: 'config', label: 'Config', hint: 'common config files', extensions: ['ini', 'conf', 'cfg', 'env', 'properties'] },
]

export function createSelectionState(): SelectionState {
  return { quickRules: new Set(), folderRules: new Map(), fileOverrides: new Map(), globRules: new Set() }
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/$/, '')
}

function parentPaths(path: string): string[] {
  const parts = normalize(path).split('/').filter(Boolean)
  const result: string[] = []
  for (let index = parts.length - 1; index > 0; index -= 1) {
    result.push(parts.slice(0, index).join('/'))
  }
  result.push('')
  return result
}

function getExtension(node: FileNode): string {
  return node.extension?.toLowerCase() ?? ''
}

function getQuickRuleForNode(node: FileNode): QuickFilter | undefined {
  if (node.kind !== 'file') return undefined
  const fileName = node.name.toLowerCase()
  const configRule = QUICK_FILTERS.find((rule) => rule.id === 'config')
  // Dot-config files such as `.env` often have no filesystem extension.
  if (fileName.startsWith('.env') || CONFIG_FILE_NAMES.has(fileName)) return configRule
  return QUICK_FILTERS.find((rule) => rule.extensions.includes(getExtension(node)))
}

export function isSelected(node: FileNode, state: SelectionState): boolean {
  if (node.kind !== 'file' || !node.eligible) return false

  const override = state.fileOverrides.get(node.path)
  if (override !== undefined) return override

  for (const parent of parentPaths(node.path)) {
    const folderRule = state.folderRules.get(parent)
    if (folderRule !== undefined) return folderRule
  }

  if ([...state.globRules].some((pattern) => matchesGlob(node.path, pattern))) return true
  const quickRule = getQuickRuleForNode(node)
  return quickRule ? state.quickRules.has(quickRule.id) : false
}

export function toggleQuickRule(state: SelectionState, ruleId: string): SelectionState {
  const quickRules = new Set(state.quickRules)
  if (quickRules.has(ruleId)) quickRules.delete(ruleId)
  else quickRules.add(ruleId)
  return { ...state, quickRules }
}

export function addGlobRule(state: SelectionState, rawPattern: string): SelectionState {
  const validation = validateGlob(rawPattern)
  if (!validation.valid || state.globRules.has(validation.pattern)) return state
  const pattern = validation.pattern
  return { ...state, globRules: new Set([...state.globRules, pattern]) }
}

export function removeGlobRule(state: SelectionState, rawPattern: string): SelectionState {
  const validation = validateGlob(rawPattern)
  const pattern = validation.valid ? validation.pattern : rawPattern.trim()
  if (!state.globRules.has(pattern)) return state
  const globRules = new Set(state.globRules)
  globRules.delete(pattern)
  return { ...state, globRules }
}

export function setFileOverride(state: SelectionState, path: string, value: boolean): SelectionState {
  const fileOverrides = new Map(state.fileOverrides)
  fileOverrides.set(path, value)
  return { ...state, fileOverrides }
}

export function setManyFileOverrides(state: SelectionState, paths: readonly string[], value: boolean): SelectionState {
  if (!paths.length) return state
  const fileOverrides = new Map(state.fileOverrides)
  for (const path of paths) fileOverrides.set(path, value)
  return { ...state, fileOverrides }
}

export function setFolderRule(state: SelectionState, path: string, value: boolean): SelectionState {
  const normalizedPath = normalize(path)
  const isWithinFolder = (candidate: string) => normalizedPath === '' || candidate === normalizedPath || candidate.startsWith(`${normalizedPath}/`)
  const folderRules = new Map(state.folderRules)
  const fileOverrides = new Map(state.fileOverrides)

  // A folder checkbox is an explicit group action. Remove more-specific rules
  // and one-off exceptions underneath it so the selected state really applies
  // to the whole group. Users can add fresh file exceptions afterward.
  for (const rulePath of folderRules.keys()) {
    if (rulePath !== normalizedPath && isWithinFolder(rulePath)) folderRules.delete(rulePath)
  }
  for (const filePath of fileOverrides.keys()) {
    if (isWithinFolder(filePath)) fileOverrides.delete(filePath)
  }
  folderRules.set(normalizedPath, value)
  return { ...state, folderRules, fileOverrides }
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

  selectedFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }))
  return { selectedFiles, folderSelection }
}

export function clearSelection(): SelectionState {
  return createSelectionState()
}

export function buildRuleSummary(state: SelectionState): string {
  const parts: string[] = []
  if (state.quickRules.size) parts.push(`${state.quickRules.size} quick ${state.quickRules.size === 1 ? 'rule' : 'rules'}`)
  if (state.globRules.size) parts.push(`${state.globRules.size} glob ${state.globRules.size === 1 ? 'rule' : 'rules'}`)
  if (state.folderRules.size) parts.push(`${state.folderRules.size} folder ${state.folderRules.size === 1 ? 'rule' : 'rules'}`)
  if (state.fileOverrides.size) parts.push(`${state.fileOverrides.size} manual ${state.fileOverrides.size === 1 ? 'override' : 'overrides'}`)
  return parts.length ? parts.join(' · ') : 'No selection rules'
}
