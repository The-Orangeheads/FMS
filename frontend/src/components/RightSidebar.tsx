import { useState } from 'react'
import { StorageDonut } from './StorageDonut'
import { ActivityEmbedding } from './ActivityEmbedding'
import { CleanupStorage } from './CleanupStorage'

type RightTab = 'statistics' | 'cleanup'

export function RightSidebar() {
  const [tab, setTab] = useState<RightTab>('statistics')

  return (
    <aside
      className="hidden w-[min(100%,320px)] shrink-0 flex-col gap-6 border-l border-border bg-surface-elevated/70 px-5 py-8 backdrop-blur-sm lg:flex"
      aria-label="Insights and activity"
    >
      <section className="rounded-xl border border-border bg-surface-elevated p-5 shadow-soft">
        <div className="mb-4 flex gap-1 rounded-lg bg-surface-muted p-1">
          <button
            type="button"
            onClick={() => setTab('statistics')}
            className={[
              'min-w-0 flex-1 rounded-md px-2 py-2 text-center text-xs font-semibold transition-colors duration-200',
              tab === 'statistics'
                ? 'bg-surface-elevated text-foreground shadow-soft'
                : 'text-foreground-muted hover:text-foreground',
            ].join(' ')}
          >
            Statistics
          </button>
          <button
            type="button"
            onClick={() => setTab('cleanup')}
            className={[
              'min-w-0 flex-1 rounded-md px-2 py-2 text-center text-xs font-semibold transition-colors duration-200',
              tab === 'cleanup'
                ? 'bg-surface-elevated text-foreground shadow-soft'
                : 'text-foreground-muted hover:text-foreground',
            ].join(' ')}
          >
            Cleanup
          </button>
        </div>

        {tab === 'statistics' ? (
          <>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              Storage statistics
            </h2>
            <p className="mb-4 text-xs text-foreground-muted">Share of space by file category</p>
            <StorageDonut usedTotalLabel="186 GB" />
          </>
        ) : (
          <>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              Cleanup storage
            </h2>
            <p className="mb-4 text-xs text-foreground-muted">Near duplicates &amp; reclaim space</p>
            <CleanupStorage />
          </>
        )}
      </section>
      <ActivityEmbedding />
    </aside>
  )
}
