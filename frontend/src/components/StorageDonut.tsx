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

type AnalyticsData = {
  [category: string]: [entries_done: number, total_entries: number, size_done: number, total_size: number]
}

import { useTheme } from '../context/ThemeContext'

const DEFAULT_ANALYTICS: AnalyticsData = {
  document: [0, 0, 0, 0],
  image: [0, 0, 0, 0],
  audio: [0, 0, 0, 0],
  other: [0, 0, 0, 0],
}

const CATEGORY_ORDER = ['document', 'image', 'audio', 'other']
const CATEGORY_LABELS: { [key: string]: string } = {
  document: 'Documents',
  image: 'Images',
  audio: 'Audio',
  other: 'Others',
}

function mapAnalyticsToSegments(analytics: AnalyticsData): StorageSegment[] {
  // Map backend category names to StorageSegment keys
  const categoryMap: { [key: string]: 'documents' | 'images' | 'audio' | 'others' } = {
    document: 'documents',
    image: 'images',
    audio: 'audio',
    other: 'others',
  }

  // Merge with defaults to ensure all categories exist
  const mergedAnalytics = { ...DEFAULT_ANALYTICS, ...analytics }

  // Calculate total size
  const totalSize = Object.values(mergedAnalytics).reduce((sum, [, , , size]) => sum + size, 0)

  const segments: StorageSegment[] = []
  const colors: { [key: string]: { color: string; faded: string; embedded?: string } } = {
    documents: { color: 'var(--color-primary)', faded: 'rgba(59, 140, 255, 0.42)', embedded: '#1e6ef4' },
    images: { color: '#34d399', faded: 'rgba(52, 211, 153, 0.40)', embedded: '#1d8f67' },
    audio: { color: '#fbbf24', faded: 'rgba(251, 191, 36, 0.38)', embedded: '#d97706' },
    others: { color: '#a78bfa', faded: '#a78bfa' },
  }

  // Process in the correct order
  CATEGORY_ORDER.forEach((backendCategory) => {
    const [done, total, , totalSize_val] = mergedAnalytics[backendCategory] || [0, 0, 0, 0]
    const segmentKey = categoryMap[backendCategory] || 'others'
    const pct = totalSize > 0 ? (totalSize_val / totalSize) * 100 : 0
    const colorScheme = colors[segmentKey]

    segments.push({
      key: segmentKey,
      label: CATEGORY_LABELS[backendCategory] || backendCategory,
      pct,
      color: colorScheme.color,
      fadedColor: colorScheme.faded,
      embeddedColor: colorScheme.embedded,
      count: total,
      embeddedCount: done,
      supportsEmbedding: segmentKey !== 'others',
    })
  })

  return segments
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function formatPercentage(value: number): string {
  return (Math.round(value * 10) / 10).toString().replace(/\.0$/, '')
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
  analytics?: AnalyticsData
}

export function StorageDonut({ usedTotalLabel, analytics }: StorageDonutProps) {
  const { theme } = useTheme()
  const analyticsData = analytics || DEFAULT_ANALYTICS
  const SEGMENTS = mapAnalyticsToSegments(analyticsData)
  const cx = 64
  const cy = 64
  const rOuter = 52
  const rInner = 34
  let angle = 0

  // Check if we have data (total size > 0)
  const totalSize = Object.values(analyticsData).reduce((sum, [, , , size]) => sum + size, 0)
  const hasData = totalSize > 0

  // Gray color based on theme
  const emptyGrayColor = theme === 'dark' ? '#374151' : '#d1d5db'

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
      isFullCircle: Math.abs(sweep - 360) < 0.1, // Check if this segment takes up full circle
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
          {!hasData && (
            // Empty state: full gray donut
            <>
              <path
                d={donutArc(cx, cy, rOuter, rInner, 0, 359.9)}
                fill={emptyGrayColor}
              />
            </>
          )}
          {hasData &&
            segmentsWithAngles.map((segment) => {
              // For full circle segments, draw two arcs to avoid SVG degenerate case
              if (segment.isFullCircle) {
                return (
                  <g key={segment.key}>
                    <path
                      d={donutArc(cx, cy, rOuter, rInner, 0, 179.9)}
                      fill={segment.supportsEmbedding ? segment.fadedColor : segment.color}
                    />
                    <path
                      d={donutArc(cx, cy, rOuter, rInner, 180, 359.9)}
                      fill={segment.supportsEmbedding ? segment.fadedColor : segment.color}
                    />
                  </g>
                )
              }
              return (
                <path
                  key={segment.key}
                  d={donutArc(cx, cy, rOuter, rInner, segment.start, segment.end)}
                  fill={segment.supportsEmbedding ? segment.fadedColor : segment.color}
                />
              )
            })}
          {hasData &&
            segmentsWithAngles.map((segment) => {
              if (
                segment.supportsEmbedding &&
                segment.embeddedProgress > 0
              ) {
                // For full circle segments, draw two arcs
                if (segment.isFullCircle) {
                  const progressEnd = 359.9 * segment.embeddedProgress
                  return (
                    <g key={`${segment.key}-embedded`}>
                      {progressEnd > 180 ? (
                        <>
                          <path
                            d={donutArc(cx, cy, rOuter, rInner, 0, 179.9)}
                            fill={segment.embeddedColor}
                          />
                          <path
                            d={donutArc(cx, cy, rOuter, rInner, 180, progressEnd)}
                            fill={segment.embeddedColor}
                          />
                        </>
                      ) : (
                        <path
                          d={donutArc(cx, cy, rOuter, rInner, 0, progressEnd)}
                          fill={segment.embeddedColor}
                        />
                      )}
                    </g>
                  )
                }
                return (
                  <path
                    key={`${segment.key}-embedded`}
                    d={donutArc(cx, cy, rOuter, rInner, segment.start, segment.embeddedEnd)}
                    fill={segment.embeddedColor}
                  />
                )
              }
              return null
            })}
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
            <span className="font-medium tabular-nums text-foreground">{formatPercentage(segment.pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
