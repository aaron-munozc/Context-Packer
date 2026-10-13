import { useVirtualizer } from '@tanstack/react-virtual'
import { FileMinus, X } from 'lucide-react'
import { useRef } from 'react'
import type { FileNode } from '@/lib/types'

export function SelectedQueue({
  files,
  onRemove,
}: {
  files: readonly FileNode[]
  onRemove: (node: FileNode) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 12,
  })

  if (files.length === 0) {
    return (
      <div className="flex min-h-48 flex-1 items-center justify-center px-6 text-center">
        <div>
          <div className="mx-auto grid size-10 place-items-center rounded-xl bg-slate-900 text-slate-600">
            <FileMinus className="size-5" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-400">Nothing selected</p>
          <p className="mt-1 max-w-xs text-xs leading-5 text-slate-600">
            Use a quick filter, select a folder, or click individual files. Removing a file creates a manual exclusion so broad rules can stay enabled.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 pb-3">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const node = files[item.index]
          if (!node) return null
          return (
            <div
              key={node.path}
              ref={virtualizer.measureElement}
              data-index={item.index}
              className="absolute inset-x-0 flex h-12 items-center"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-900 bg-slate-950/45 px-2.5 py-2 hover:border-slate-800">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-slate-900 text-xs font-semibold uppercase text-slate-500">
                  {node.extension || '·'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-300">{node.name}</p>
                  <p className="truncate text-[0.65rem] text-slate-600">{node.path}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(node)}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-300"
                  title="Remove this file from the selection"
                  aria-label={`Remove ${node.path}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
