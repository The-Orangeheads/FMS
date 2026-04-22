import { useEffect, useState, useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'

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
  const categoryMap: { [key: string]: 'documents' | 'images' | 'audio' | 'others' } = {
    document: 'documents',
    image: 'images',
    audio: 'audio',
    other: 'others',
  }
  const mergedAnalytics = { ...DEFAULT_ANALYTICS, ...analytics }
  const totalSize = Object.values(mergedAnalytics).reduce((sum, [, , , size]) => sum + size, 0)
  const segments: StorageSegment[] = []
  const colors: { [key: string]: { color: string; faded: string; embedded?: string } } = {
    documents: { color: 'var(--color-primary)', faded: 'rgba(59, 140, 255, 0.25)', embedded: 'var(--color-primary)' },
    images: { color: '#34d399', faded: 'rgba(52, 211, 153, 0.25)', embedded: '#34d399' },
    audio: { color: '#fbbf24', faded: 'rgba(251, 191, 36, 0.25)', embedded: '#fbbf24' },
    others: { color: '#a78bfa', faded: 'rgba(167, 139, 250, 0.25)' },
  }

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
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function formatBytes(bytes: number, decimals = 1): string {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function donutArc(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startDeg);
  const p2 = polar(cx, cy, rOuter, endDeg);
  const p3 = polar(cx, cy, rInner, endDeg);
  const p4 = polar(cx, cy, rInner, startDeg);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

type StorageDonutProps = {
  usedTotalLabel: string
  analytics?: AnalyticsData
}

export function StorageDonut({ usedTotalLabel, analytics }: StorageDonutProps) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [initialAnimDone, setInitialAnimDone] = useState(false); // New state
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  
  useEffect(() => {
    // Phase 1: Trigger the entrance animation
    const mountTimer = setTimeout(() => setMounted(true), 50);
    
    // Phase 2: Once the longest stagger (700ms) + duration (500ms) is done,
    // we disable the staggered delay forever for this mount.
    const doneTimer = setTimeout(() => setInitialAnimDone(true), 1500);

    return () => {
      clearTimeout(mountTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  const analyticsData = analytics || DEFAULT_ANALYTICS;
  const totalSize = Object.values(analyticsData).reduce((sum, [, , , size]) => sum + size, 0);
  const hasData = totalSize > 0;
  const emptyGrayColor = theme === 'dark' ? '#374151' : '#d1d5db';

  const SEGMENTS = useMemo(() => mapAnalyticsToSegments(analyticsData), [analyticsData, totalSize]);

const segmentsWithAngles = useMemo(() => {
    let currentAngle = 0;
    return SEGMENTS.map((segment) => {
      const start = currentAngle;
      const sweep = (segment.pct / 100) * 360;
      const end = currentAngle + sweep;
      const embeddedProgress = segment.supportsEmbedding 
        ? Math.min(1, (segment.embeddedCount ?? 0) / segment.count) 
        : 0;
      const embeddedEnd = start + sweep * embeddedProgress;
      currentAngle = end;
      
      const backendKey = Object.keys(CATEGORY_LABELS).find(k => CATEGORY_LABELS[k] === segment.label) || 'other';
      const rawSize = analyticsData[backendKey]?.[3] || 0;

      return { ...segment, start, end, embeddedEnd, embeddedProgress, rawSize, isFullCircle: Math.abs(sweep - 360) < 0.1 };
    });
  }, [SEGMENTS, analyticsData]);

  const activeSegment = hoveredKey ? segmentsWithAngles.find(s => s.key === hoveredKey) : null;

  // Global Progress Logic
  const embeddableSegments = SEGMENTS.filter((segment) => segment.supportsEmbedding)
  const totalFiles = embeddableSegments.reduce((sum, segment) => sum + segment.count, 0)
  const totalEmbedded = embeddableSegments.reduce((sum, segment) => sum + (segment.embeddedCount ?? 0), 0)
  const overallProgress = totalFiles ? Math.round((totalEmbedded / totalFiles) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className={`relative mx-auto w-[min(100%,200px)] transition-all duration-1000 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
        <svg viewBox="0 0 128 128" className="h-auto w-full drop-shadow-soft overflow-visible">
          {/* EMPTY STATE: Show gray ring if no data as a single arc */}
          {!hasData && (
            <path
              d={donutArc(64, 64, 52, 34, 0, 359.99)}
              fill={emptyGrayColor}
              className="transition-opacity duration-300"
            />
          )}

          {hasData && segmentsWithAngles.map((s) => {
            const isHovered = hoveredKey === s.key;
            const isDimmed = hoveredKey !== null && !isHovered;
            
            const rO = isHovered ? 56 : 52;
            const rI = isHovered ? 32 : 34;

            return (
              <g 
                key={s.key} 
                className="cursor-pointer transition-opacity duration-300 ease-in-out"
                onMouseEnter={() => setHoveredKey(s.key)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{ opacity: isDimmed ? 0.25 : 1 }}
              >
                <path
                  d={s.isFullCircle 
                    ? donutArc(64, 64, rO, rI, 0, 179.9) + " " + donutArc(64, 64, rO, rI, 180, 359.9)
                    : donutArc(64, 64, rO, rI, s.start, s.end)}
                  fill={s.supportsEmbedding ? s.fadedColor : s.color}
                  className="transition-all duration-300"
                />
                {s.supportsEmbedding && s.embeddedProgress > 0 && (
                  <path
                    d={s.isFullCircle
                      ? donutArc(64, 64, rO, rI, 0, Math.min(179.9, 359.9 * s.embeddedProgress))
                      : donutArc(64, 64, rO, rI, s.start, s.embeddedEnd)}
                    fill={s.embeddedColor}
                    className="transition-all duration-300"
                  />
                )}
              </g>
            );
          })}
          <circle cx="64" cy="64" r={31} className="fill-surface-elevated transition-all duration-300" />
        </svg>

        {/* --- DYNAMIC CENTER LABEL --- */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-foreground-muted">
            {activeSegment ? activeSegment.label : "Total used"}
          </p>
          <p className="text-lg font-bold leading-tight text-foreground tabular-nums">
            {activeSegment ? formatBytes(activeSegment.rawSize) : usedTotalLabel}
          </p>
          {activeSegment && (
            <p className="text-[0.65rem] font-semibold text-primary animate-in fade-in slide-in-from-bottom-1">
              {activeSegment.supportsEmbedding 
                ? `${activeSegment.embeddedCount} / ${activeSegment.count} tracked` 
                : `${activeSegment.count} items`}
            </p>
          )}
        </div>
      </div>

      {/* Global Embedding Progress Bar */}
      <div className={`space-y-2 rounded-3xl bg-surface-muted p-3 text-sm transition-[transform,opacity] duration-700 delay-500 ${mounted ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-foreground antialiased" style={{ backfaceVisibility: 'hidden' }}>Tracked Files</span>
          <span className="font-medium tabular-nums text-foreground">{mounted ? overallProgress : 0}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-out"
            style={{ width: `${mounted ? overallProgress : 0}%` }}
          />
        </div>
      </div>

      {/* --- LEGEND --- */}
      <ul className="space-y-2 text-sm">
        {segmentsWithAngles.map((segment, i) => {
          const isHighlighted = hoveredKey === segment.key;
          const isDimmed = hoveredKey !== null && !isHighlighted;

          return (
            <li 
              key={segment.key} 
              style={{ 
                opacity: !mounted ? 0 : (isDimmed ? 0.3 : 1),
                transform: !mounted ? 'translateY(10px)' : 'translateY(0)',
                
                // STAGGER FIX:
                // Only use the staggered delay during the very first 1.5s of the component's life.
                // After that, transitionDelay is always 0ms for both hovering and de-hovering.
                transitionDelay: !initialAnimDone ? `${400 + (i * 100)}ms` : '0ms',
                
                backfaceVisibility: 'hidden',
              }}
              className="flex items-center justify-between gap-2 p-1 -mx-1 rounded-lg transition-[opacity,transform,background-color] duration-500 ease-out will-change-[opacity,transform]"
            >
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: segment.color }} />
                <span className="min-w-0">
                  <span className="block text-foreground font-semibold antialiased">
                    {segment.label}
                  </span>
                  <span className="text-[0.75rem] text-foreground-muted antialiased">
                    {segment.supportsEmbedding ? `${segment.embeddedCount}/${segment.count}` : segment.count} files
                  </span>
                </span>
              </span>
              <span className="font-bold tabular-nums text-foreground antialiased">
                {Math.round(segment.pct)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}