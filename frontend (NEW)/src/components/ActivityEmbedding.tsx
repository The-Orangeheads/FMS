import { useCallback, useEffect, useRef, useState } from 'react'
import { IconFileText, IconRefresh } from './icons'

type Completed = { id: string; name: string; durationLabel: string }
type Queued = { id: string; name: string }
type ActivePhase = 'preprocessing' | 'embedding'

type Active = {
  id: string
  name: string
  phase: ActivePhase
  embedCurrent: number
  embedTotal: number
}

const SNAPSHOT = {
  active: {
    id: 'a1',
    name: 'Research_Corpus_A.zip',
    phase: 'preprocessing' as ActivePhase,
    embedCurrent: 5,
    embedTotal: 16,
  },
  queue: [
    { id: 'q1', name: 'Design_Assets_2024/' },
    { id: 'q2', name: 'Audio_Transcripts/' },
  ] as Queued[],
  completed: [
    { id: 'c1', name: 'Archive_2023_notes.zip', durationLabel: '1m 04s' },
    { id: 'c2', name: 'Brand_guidelines.pdf', durationLabel: '42s' },
  ] as Completed[],
}

function pctFromEmbedding(current: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

export function ActivityEmbedding() {
  const [active, setActive] = useState<Active | null>(SNAPSHOT.active)
  const [queue, setQueue] = useState<Queued[]>(SNAPSHOT.queue)
  const [completed, setCompleted] = useState<Completed[]>(SNAPSHOT.completed)
  const [resyncing, setResyncing] = useState(false)
  const [resyncEpoch, setResyncEpoch] = useState(0)
  const preprocessTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetFromServer = useCallback(() => {
    setResyncing(true)
    setActive(SNAPSHOT.active)
    setQueue(SNAPSHOT.queue)
    setCompleted(SNAPSHOT.completed)
    setResyncEpoch((n) => n + 1)
    window.setTimeout(() => setResyncing(false), 650)
  }, [])

  useEffect(() => {
    if (!active || active.phase !== 'preprocessing') return
    preprocessTimer.current = window.setTimeout(() => {
      setActive((prev) =>
        prev && prev.phase === 'preprocessing'
          ? { ...prev, phase: 'embedding', embedCurrent: 5, embedTotal: 16 }
          : prev,
      )
    }, 2400)
    return () => {
      if (preprocessTimer.current) clearTimeout(preprocessTimer.current)
    }
  }, [active?.id, active?.phase, resyncEpoch])

  const statusLine = (a: Active) => {
    if (a.phase === 'preprocessing') return 'Preprocessing…'
    return `Embedding ${a.embedCurrent} / ${a.embedTotal} chunks`
  }

  const progressValue = (a: Active) => {
    if (a.phase === 'preprocessing') return 22
    return pctFromEmbedding(a.embedCurrent, a.embedTotal)
  }

  return (
    <section className="mt-2" aria-labelledby="activity-heading">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 id="activity-heading" className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
          Activity &amp; embedding
        </h2>
        <button
          type="button"
          onClick={resetFromServer}
          disabled={resyncing}
          title="Resync embedding queue"
          aria-label="Resync embedding files"
          className="rounded-full p-2 text-foreground-muted transition hover:bg-surface-muted hover:text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconRefresh className={`h-4 w-4 ${resyncing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-foreground-muted">
        {resyncing ? 'Syncing with indexer…' : 'Files processed for AI embeddings.'}
      </p>

      <ul className="space-y-4">
        {active ? (
          <li>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <IconFileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{active.name}</p>
                <p className="mt-0.5 text-xs font-medium text-primary">{statusLine(active)}</p>
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
                  role="progressbar"
                  aria-valuenow={progressValue(active)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${statusLine(active)} for ${active.name}`}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-material"
                    style={{ width: `${progressValue(active)}%` }}
                  />
                </div>
                {active.phase === 'embedding' ? (
                  <p className="mt-1 text-xs tabular-nums text-foreground-muted">
                    {progressValue(active)}% · chunk {active.embedCurrent} of {active.embedTotal}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-foreground-muted">Preparing files…</p>
                )}
              </div>
            </div>
          </li>
        ) : null}

        {queue.map((job) => (
          <li key={job.id}>
            <div className="flex items-start gap-3 opacity-90">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground-muted">
                <IconFileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{job.name}</p>
                <p className="mt-0.5 text-xs font-medium text-foreground-muted">In queue</p>
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted/80"
                  aria-hidden
                >
                  <div className="h-full w-0 rounded-full bg-primary/20" />
                </div>
              </div>
            </div>
          </li>
        ))}

        {completed.map((job) => (
          <li key={job.id}>
            <div className="flex items-start gap-3 opacity-45">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground-muted">
                <IconFileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{job.name}</p>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  Embedded in {job.durationLabel}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
