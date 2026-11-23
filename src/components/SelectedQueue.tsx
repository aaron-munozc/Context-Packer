import { useVirtualizer } from '@tanstack/react-virtual'
import { FileMinus, X } from 'lucide-react'
import { useRef } from 'react'
import type { FileNode } from '@/lib/types'

export function SelectedQueue({
  files,
  activeGlobRules,
  onRemove,
  onRemoveGlobRule,
}: {
  files: readonly FileNode[]
  activeGlobRules: readonly string[]
  onRemove: (node: FileNode) => void
  onRemoveGlobRule: (pattern: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 12,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {activeGlobRules.length > 0 && (
        <div className="shrink-0 border-b border-slate-900 px-3 py-2">
          <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-wider text-slate-600">Active glob rules</p>
          <div className="flex flex-wrap gap-1.5">
            {activeGlobRules.map((pattern) => (
              <span key={pattern} className="inline-flex max-w-full items-center gap-1 rounded-md border border-indigo-500/20 bg-indigo-500/5 py-1 pl-2 pr-1 text-[0.65rem] text-indigo-200">
                <code className="max-w-64 truncate">{pattern}</code>
                <button type="button" onClick={() => onRemoveGlobRule(pattern)} className="grid size-5 shrink-0 place-items-center rounded text-indigo-300/60 hover:bg-rose-500/10 hover:text-rose-300" title={`Remove ${pattern}`} aria-label={`Remove glob rule ${pattern}`}><X className="size-3" /></button>
              </span>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <div className="flex min-h-48 flex-1 items-center justify-center px-6 text-center">
          <div>
            <div className="mx-auto grid size-10 place-items-center rounded-xl bg-slate-900 text-slate-600"><FileMinus className="size-5" /></div>
            <p className="mt-3 text-sm font-medium text-slate-400">Nothing selected</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-600">Select a folder, use a quick filter, search and select matching files, or apply a saved glob.</p>
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 pb-3">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const node = files[item.index]
              if (!node) return null
              return (
                <div key={node.path} ref={virtualizer.measureElement} data-index={item.index} className="absolute inset-x-0 flex h-12 items-center" style={{ transform: `translateY(${item.start}px)` }}>
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-900 bg-slate-950/45 px-2.5 py-2 hover:border-slate-800">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-slate-900 text-[0.6rem] font-semibold uppercase text-slate-500">{node.extension || '·'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-300">{node.name}</p>
                      <p className="truncate text-[0.65rem] text-slate-600">{node.path}</p>
                    </div>
                    <span className="hidden shrink-0 text-[0.62rem] tabular-nums text-slate-600 xl:block">{formatBytes(node.size)}</span>
                    <button type="button" onClick={() => onRemove(node)} className="grid size-7 shrink-0 place-items-center rounded-md text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-300" title="Remove this file from the selection" aria-label={`Remove ${node.path}`}><X className="size-4" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
