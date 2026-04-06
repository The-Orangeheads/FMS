const SEGMENTS = [
  { key: 'documents', label: 'Documents', pct: 40, color: 'var(--color-primary)' },
  { key: 'images', label: 'Images', pct: 30, color: '#34d399' },
  { key: 'audio', label: 'Audio', pct: 15, color: '#fbbf24' },
  { key: 'others', label: 'Others', pct: 15, color: '#a78bfa' },
] as const

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
          {SEGMENTS.map((s) => {
            const start = angle
            const sweep = (s.pct / 100) * 360
            const end = angle + sweep
            const d = donutArc(cx, cy, rOuter, rInner, start, end)
            angle = end
            return <path key={s.key} d={d} fill={s.color} />
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
      <ul className="space-y-2 text-sm">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: s.color }}
              />
              <span className="text-foreground-muted">{s.label}</span>
            </span>
            <span className="font-medium tabular-nums text-foreground">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
