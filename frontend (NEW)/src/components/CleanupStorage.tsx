import { useState } from 'react'
import { IconFileText } from './icons'

type DupFile = { id: string; name: string; size: string }

type DupGroup = {
  id: string
  similarityPct: number
  files: DupFile[]
}

const INITIAL_GROUPS: DupGroup[] = [
  {
    id: 'g1',
    similarityPct: 96,
    files: [
      { id: 'f1', name: 'Q3_Report_final.pdf', size: '2.1 MB' },
      { id: 'f2', name: 'Q3_Report_copy.pdf', size: '2.1 MB' },
      { id: 'f3', name: 'Q3_Report (1).pdf', size: '2.0 MB' },
    ],
  },
  {
    id: 'g2',
    similarityPct: 91,
    files: [
      { id: 'f4', name: 'logo_mark.svg', size: '12 KB' },
      { id: 'f5', name: 'logo_mark_export.svg', size: '12 KB' },
    ],
  },
  {
    id: 'g3',
    similarityPct: 87,
    files: [
      { id: 'f6', name: 'notes_backup.md', size: '48 KB' },
      { id: 'f7', name: 'notes.md', size: '44 KB' },
    ],
  },
]

export function CleanupStorage() {
  const [groups, setGroups] = useState(INITIAL_GROUPS)

  const removeFile = (groupId: string, fileId: string) => {
    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.id !== groupId) return g
          const files = g.files.filter((f) => f.id !== fileId)
          return { ...g, files }
        })
        .filter((g) => g.files.length > 1),
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-foreground-muted">
        Near-duplicate files detected by content similarity. Delete extras to free space; keep at least one file per group.
      </p>
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-muted/50 px-4 py-8 text-center text-sm text-foreground-muted">
          No duplicate groups found. Run a scan from the desktop agent to refresh.
        </p>
      ) : (
        <ul className="space-y-4">
          {groups.map((g) => (
            <li
              key={g.id}
              className="rounded-xl border border-border bg-surface-muted/40 p-4 shadow-soft"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">Near duplicate group</span>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                  {g.similarityPct}% similar
                </span>
              </div>
              <ul className="space-y-2">
                {g.files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 rounded-lg border border-border/80 bg-surface-elevated px-3 py-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-primary">
                      <IconFileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                      <p className="text-xs text-foreground-muted">{f.size}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => removeFile(g.id, f.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
