type StorageSegment = {
  key: 'documents' | 'images' | 'audio' | 'others'
  label: string
  pct: number
  color: string
  fadedColor: string
  embeddedColor?: string
  count: number
  embeddedCount?: number
  supportsEmbedding?: boolean
}

const SEGMENTS: StorageSegment[] = [
  {
    key: 'documents',
    label: 'Documents',
    pct: 40,
    color: 'var(--color-primary)',
    fadedColor: 'rgba(59, 140, 255, 0.42)',
    embeddedColor: '#1e6ef4',
    count: 452,
    embeddedCount: 250,
    supportsEmbedding: true,
  },
  {
    key: 'images',
    label: 'Images',
    pct: 30,
    color: '#34d399',
    fadedColor: 'rgba(52, 211, 153, 0.40)',
    embeddedColor: '#1d8f67',
    count: 288,
    embeddedCount: 234,
    supportsEmbedding: true,
  },
  {
    key: 'audio',
    label: 'Audio',
    pct: 15,
    color: '#fbbf24',
    fadedColor: 'rgba(251, 191, 36, 0.38)',
    embeddedColor: '#d97706',
    count: 98,
    embeddedCount: 64,
    supportsEmbedding: true,
  },
  {
    key: 'others',
    label: 'Others',
    pct: 15,
    color: '#a78bfa',
    fadedColor: '#a78bfa',
    count: 120,
    supportsEmbedding: false,
  },
]

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number,
) {
  const large = endDeg - startDeg > 180 ? 1 : 0
  const p1 = polar(cx, cy, rOuter, startDeg)
  const p2 = polar(cx, cy, rOuter, endDeg)
  const p3 = polar(cx, cy, rInner, endDeg)
  const p4 = polar(cx, cy, rInner, startDeg)
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ')
}

type StorageDonutProps = {
  usedTotalLabel: string
}

export function StorageDonut({ usedTotalLabel }: StorageDonutProps) {
  const cx = 64
  const cy = 64
  const rOuter = 52
  const rInner = 34
  let angle = 0

  const embeddableSegments = SEGMENTS.filter((segment) => segment.supportsEmbedding)
  const totalFiles = embeddableSegments.reduce((sum, segment) => sum + segment.count, 0)
  const totalEmbedded = embeddableSegments.reduce((sum, segment) => sum + (segment.embeddedCount ?? 0), 0)
  const overallProgress = totalFiles ? Math.round((totalEmbedded / totalFiles) * 100) : 0

  const segmentsWithAngles = SEGMENTS.map((segment) => {
    const start = angle
    const sweep = (segment.pct / 100) * 360
    const end = angle + sweep
    const embeddedProgress = segment.supportsEmbedding
      ? Math.min(1, (segment.embeddedCount ?? 0) / segment.count)
      : 0
    const embeddedEnd = start + sweep * embeddedProgress
    angle = end
    return {
      ...segment,
      start,
      end,
      embeddedEnd,
      embeddedProgress,
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto w-[min(100%,200px)]">
        <svg
          viewBox="0 0 128 128"
          className="h-auto w-full drop-shadow-soft"
          role="img"
          aria-label={`Storage statistics: ${usedTotalLabel} used across categories`}
        >
          <title>Storage breakdown by category</title>
          {segmentsWithAngles.map((segment) => (
            <path
              key={segment.key}
              d={donutArc(cx, cy, rOuter, rInner, segment.start, segment.end)}
              fill={segment.supportsEmbedding ? segment.fadedColor : segment.color}
            />
          ))}
          {segmentsWithAngles.map(
            (segment) =>
              segment.supportsEmbedding &&
              segment.embeddedProgress > 0 && (
                <path
                  key={`${segment.key}-embedded`}
                  d={donutArc(cx, cy, rOuter, rInner, segment.start, segment.embeddedEnd)}
                  fill={segment.embeddedColor}
                />
              ),
          )}
          <circle cx={cx} cy={cy} r={rInner - 1} className="fill-surface-elevated" />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-muted">
            Total used
          </p>
          <p className="text-lg font-bold leading-tight text-foreground">{usedTotalLabel}</p>
        </div>
      </div>

      <div className="space-y-2 rounded-3xl bg-surface-muted p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-foreground">Embedding progress</span>
          <span className="font-medium tabular-nums text-foreground">{overallProgress}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      <ul className="space-y-2 text-sm">
        {segmentsWithAngles.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: segment.color }}
              />
              <span className="min-w-0">
                <span className="block text-foreground font-semibold">{segment.label}</span>
                <span className="text-[0.75rem] text-foreground-muted">
                  {segment.supportsEmbedding ? (
                    <>{segment.embeddedCount}/{segment.count} items</>
                  ) : (
                    <>{segment.count} items</>
                  )}
                </span>
              </span>
            </span>
            <span className="font-medium tabular-nums text-foreground">{segment.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
