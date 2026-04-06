import { IconLayoutGrid, IconSparkles } from './icons'

const NAV = [
  { id: 'dash', label: 'Dashboard', icon: IconLayoutGrid },
  { id: 'ai', label: 'AI Search', icon: IconSparkles },
] as const

export function LeftNav() {
  return (
    <aside
      className="flex w-16 shrink-0 flex-col border-r border-border bg-surface-elevated/80 py-5 backdrop-blur-sm sm:w-[220px] sm:py-6"
      aria-label="Main navigation"
    >
      <div className="mb-6 px-3 sm:mb-8 sm:px-5">
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <span className="flex h-9 w-9 items-center justify-center rounded-ui bg-primary/15 text-primary">
            <IconSparkles className="h-5 w-5" />
          </span>
          <div className="hidden min-w-0 sm:block">
            <p className="text-sm font-bold leading-tight text-foreground">Smart Files</p>
            <p className="text-xs text-foreground-muted">AI context search</p>
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2 sm:px-3">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = item.id === 'dash'
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              title={item.label}
              className={[
                'flex items-center justify-center gap-3 rounded-ui px-2 py-2.5 text-sm font-medium transition-colors duration-200 ease-material sm:justify-start sm:px-3',
                active
                  ? 'bg-primary/12 text-primary'
                  : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
              ].join(' ')}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden sm:inline">{item.label}</span>
            </a>
          )
        })}
      </nav>
    </aside>
  )
}
