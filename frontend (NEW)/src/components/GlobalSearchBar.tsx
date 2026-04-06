import { IconImageSearch, IconSearch, IconSettings } from './icons'

type GlobalSearchBarProps = {
  onOpenSettings: () => void
  searchValue: string
  onSearchValueChange: (value: string) => void
  onSubmitSearch: () => void
  searchActive: boolean
  onClearSearch: () => void
}

export function GlobalSearchBar({
  onOpenSettings,
  searchValue,
  onSearchValueChange,
  onSubmitSearch,
  searchActive,
  onClearSearch,
}: GlobalSearchBarProps) {
  return (
    <header className="border-b border-border bg-surface-elevated/90 px-6 py-4 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="global-search" className="sr-only">
            Search files and semantic context
          </label>
          <form
            className="flex h-14 items-stretch overflow-hidden rounded-t-xl border-b-2 border-border bg-surface-muted shadow-soft transition-colors duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmitSearch()
            }}
          >
            <span
              className="flex shrink-0 items-center pl-4 text-foreground-muted"
              aria-hidden
            >
              <IconSearch className="h-5 w-5" />
            </span>
            <input
              id="global-search"
              type="search"
              value={searchValue}
              onChange={(e) => onSearchValueChange(e.target.value)}
              placeholder="Search by meaning, text, or metadata…"
              className="min-w-0 flex-1 border-0 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-foreground-muted/60"
            />
            <button
              type="button"
              title="Reverse image search"
              aria-label="Attach or search by image"
              className="inline-flex shrink-0 items-center justify-center border-l border-border/60 px-3 text-foreground-muted transition-colors duration-200 hover:bg-primary/10 hover:text-primary focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <IconImageSearch className="h-5 w-5" />
            </button>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center justify-center rounded-r-none bg-primary px-6 text-sm font-medium text-on-primary transition-all duration-300 ease-material hover:bg-primary/90 active:scale-[0.98] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              Search
            </button>
          </form>
          {searchActive ? (
            <button
              type="button"
              onClick={onClearSearch}
              className="mt-2 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Clear search — back to dashboard
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-muted text-foreground transition-all duration-200 ease-material hover:bg-primary/10 hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Open settings"
          >
            <IconSettings className="h-[22px] w-[22px]" />
          </button>
        </div>
      </div>
    </header>
  )
}
