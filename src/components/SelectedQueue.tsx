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
    <div className="selected-queue">
      {activeGlobRules.length > 0 && (
        <div className="active-glob-section">
          <p className="active-glob-label">Active glob rules</p>
          <div className="flex flex-wrap gap-1.5">
            {activeGlobRules.map((pattern) => (
              <span key={pattern} className="active-glob-chip">
                <code className="max-w-64 truncate">{pattern}</code>
                <button type="button" onClick={() => onRemoveGlobRule(pattern)} className="active-glob-remove" title={`Remove ${pattern}`} aria-label={`Remove glob rule ${pattern}`}><X className="size-3" /></button>
              </span>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <div className="queue-empty">
          <div>
            <div className="queue-empty-icon"><FileMinus className="size-5" /></div>
            <p className="queue-empty-title">Nothing selected</p>
            <p className="queue-empty-copy">Select a folder, use a quick filter, search and select matching files, or apply a saved glob.</p>
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="queue-items-scroll">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const node = files[item.index]
              if (!node) return null
              return (
                <div key={node.path} ref={virtualizer.measureElement} data-index={item.index} className="absolute inset-x-0 flex h-12 items-center" style={{ transform: `translateY(${item.start}px)` }}>
                  <div className="queue-item-card">
                    <span className="queue-item-ext">{node.extension || '·'}</span>
                    <div className="queue-item-copy">
                      <p className="queue-item-name">{node.name}</p>
                      <p className="queue-item-path">{node.path}</p>
                    </div>
                    <span className="queue-item-size hidden xl:block">{formatBytes(node.size)}</span>
                    <button type="button" onClick={() => onRemove(node)} className="queue-remove" title="Remove this file from the selection" aria-label={`Remove ${node.path}`}><X className="size-4" /></button>
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
