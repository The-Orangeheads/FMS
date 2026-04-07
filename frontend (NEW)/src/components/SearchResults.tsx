import { IconFileImage, IconFileText } from './icons'

type ResultRow = {
  name: string
  match: number
  type: 'pdf' | 'image'
  bestPage?: number
}

const RESULTS: ResultRow[] = [
  { name: 'Product_Spec_2024.pdf', match: 94, type: 'pdf', bestPage: 12 },
  { name: 'hero_illustration.svg', match: 91, type: 'image' },
  { name: 'Customer_Interview_Notes.md', match: 88, type: 'pdf', bestPage: 3 },
  { name: 'ui_mockup_export.png', match: 85, type: 'image' },
  { name: 'Embedding_Pipeline.pdf', match: 82, type: 'pdf', bestPage: 7 },
  { name: 'Project_Plan.docx', match: 79, type: 'pdf', bestPage: 1 },
  { name: 'Logo_Variants.ai', match: 76, type: 'image' },
  { name: 'Meeting_Minutes.txt', match: 73, type: 'pdf', bestPage: 5 },
]

type SearchResultsProps = {
  query: string
  results?: any[]
  isLoading?: boolean
}

export function SearchResults({ query, results, isLoading = false }: SearchResultsProps) {
  const q = query.trim()

  if (isLoading) {
    return (
      <div aria-labelledby="results-heading">
        <h2 id="results-heading" className="mb-4 text-center text-3xl font-bold text-foreground">
          Search results
        </h2>
        <p className="mb-4 text-sm text-foreground-muted">
          Fetching matches for <span className="font-medium text-foreground">&ldquo;{q}&rdquo;</span>…
        </p>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface-elevated px-4 py-3 shadow-soft animate-pulse"
            >
              <span className="h-14 w-14 rounded-lg bg-surface-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="block h-4 w-3/4 rounded-xl bg-surface-muted" />
                <span className="block h-3 w-1/2 rounded-xl bg-surface-muted" />
              </div>
              <span className="h-8 w-16 rounded-full bg-surface-muted" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const transformedResults = results ? results.map((result: any) => ({
    name: result.sourceFile || result.id,
    match: Math.round((result.score || result.rrf_rank || 0) * 100),
    type: result.type === 'image' ? 'image' : 'pdf',
    bestPage: result.metadata?.page_num || undefined
  })) : RESULTS

  return (
    <div aria-labelledby="results-heading">
      <h2 id="results-heading" className="mb-4 text-center text-3xl font-bold text-foreground">
        Search results
      </h2>
      {q ? (
        <p className="mb-4 text-sm text-foreground-muted">
          Showing matches for{' '}
          <span className="font-medium text-foreground">&ldquo;{q}&rdquo;</span>
        </p>
      ) : (
        <p className="mb-4 text-sm text-foreground-muted">Showing semantic matches.</p>
      )}
      <ul className="flex flex-col gap-3">
        {transformedResults.map((r) => (
          <li key={r.name}>
            <button
              type="button"
              className="flex w-full items-center gap-4 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-left shadow-soft transition-all duration-300 ease-material hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                {r.type === 'pdf' ? (
                  <span className="relative flex h-11 w-9 flex-col rounded border border-foreground/10 bg-surface-elevated">
                    <span className="mx-1 mt-1 h-1 w-4 rounded-sm bg-foreground/15" />
                    <span className="mx-1 mt-0.5 h-px w-full bg-foreground/10" />
                    <IconFileText className="m-auto h-7 w-7 text-primary" />
                  </span>
                ) : (
                  <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border border-primary/20 bg-gradient-to-br from-primary/20 to-emerald-400/10">
                    <IconFileImage className="h-8 w-8 text-primary/90" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{r.name}</span>
                <span className="text-xs text-foreground-muted">
                  {r.type === 'pdf' && r.bestPage != null ? (
                    <>
                      Best match on page {r.bestPage} · Semantic match
                    </>
                  ) : (
                    'Semantic match'
                  )}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-primary/12 px-3 py-1.5 text-sm font-semibold tabular-nums text-primary">
                {r.match}% match
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
