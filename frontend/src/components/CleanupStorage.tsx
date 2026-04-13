import {
  useState,
  useMemo,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
} from "react";
import type { TransitionEvent } from "react";
import { File, Check, X, ExternalLink, Trash2 } from "lucide-react";
import {
  readDuplicateSimilarityThreshold,
  SFM_SETTINGS_CHANGED_EVENT,
} from "../libs/sfmSettingsClient";

// --- FORMATTING UTILS ---
function formatBytes(bytes: number, decimals = 1): string {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

// --- TYPES ---
interface FileNode {
  id: number;
  name: string;
  path: string;
  size: number;
  date: number;
}

interface LayoutNode extends FileNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

interface SimilarityEdge {
  id: number;
  source: number;
  target: number;
  similarity: number;
}

interface AdjacentNodeData {
  node: LayoutNode;
  similarity: number;
}

type PanelSide = "left" | "right";

const PANEL_PAD = 12;
const PANEL_TRANSITION =
  "transform 500ms cubic-bezier(0.2, 0, 0, 1), opacity 500ms cubic-bezier(0.2, 0, 0, 1)";

const BELOW_THRESHOLD_EDGE = "rgb(148 163 184)";
const EDGE_YELLOW = { r: 250, g: 204, b: 21 };
const EDGE_RED = { r: 220, g: 38, b: 38 };

const CONSTANT_EDGE_WIDTH = 8;

function similarityEdgeStroke(similarity: number, threshold: number): string {
  if (similarity < threshold - 1e-6) return BELOW_THRESHOLD_EDGE;
  const span = Math.max(1e-6, 1 - threshold);
  const t = Math.max(0, Math.min(1, (similarity - threshold) / span));
  const r = Math.round(EDGE_YELLOW.r + (EDGE_RED.r - EDGE_YELLOW.r) * t);
  const g = Math.round(EDGE_YELLOW.g + (EDGE_RED.g - EDGE_YELLOW.g) * t);
  const b = Math.round(EDGE_YELLOW.b + (EDGE_RED.b - EDGE_YELLOW.b) * t);
  return `rgb(${r} ${g} ${b})`;
}

// --- DYNAMIC GRAPH LAYOUT ALGORITHM ---
function calcLayout(nodes: FileNode[], edges: SimilarityEdge[]): LayoutNode[] {
  const iters = 300;
  const kRepel = 600;
  const kSpring = 0.1;
  const idealDist = 25;
  const kCenter = 0.04;
  const damp = 0.85;

  const pos: LayoutNode[] = nodes.map((n, i) => {
    const angle = (i * 2 * Math.PI) / nodes.length;
    return {
      ...n,
      x: 50 + Math.cos(angle) * 40,
      y: 50 + Math.sin(angle) * 40,
      vx: 0,
      vy: 0,
    };
  });

  for (let i = 0; i < iters; i++) {
    for (let a = 0; a < pos.length; a++) {
      for (let b = a + 1; b < pos.length; b++) {
        let dx = pos[a].x - pos[b].x;
        let dy = pos[a].y - pos[b].y;
        let dSq = dx * dx + dy * dy;
        if (dSq === 0) {
          dx = 0.1;
          dy = 0.1;
          dSq = 0.02;
        }

        const d = Math.sqrt(dSq);
        const f = kRepel / dSq;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;

        pos[a].vx! += fx;
        pos[a].vy! += fy;
        pos[b].vx! -= fx;
        pos[b].vy! -= fy;
      }
    }

    for (const edge of edges) {
      const aIdx = pos.findIndex((n) => n.id === edge.source);
      const bIdx = pos.findIndex((n) => n.id === edge.target);
      if (aIdx === -1 || bIdx === -1) continue;

      const a = pos[aIdx];
      const b = pos[bIdx];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0) d = 0.1;

      const f = kSpring * edge.similarity * (d - idealDist);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;

      a.vx! += fx;
      a.vy! += fy;
      b.vx! -= fx;
      b.vy! -= fy;
    }

    for (const p of pos) {
      p.vx! += (50 - p.x) * kCenter;
      p.vy! += (50 - p.y) * kCenter;

      p.x += p.vx!;
      p.y += p.vy!;

      p.vx! *= damp;
      p.vy! *= damp;

      p.x = Math.max(2, Math.min(98, p.x));
      p.y = Math.max(2, Math.min(98, p.y));
    }
  }

  return pos;
}

// --- EXPANDED MOCK DATA (Int based id, size, date) ---
const MOCK_NODES: FileNode[] = [
  { id: 1, name: "Q3_Report_Final.pdf", path: "/docs/finance/Q3_Report_Final.pdf", size: 2516582, date: 1759363200000 },
  { id: 2, name: "Q3_Report_v2.pdf", path: "/docs/archive/Q3_Report_v2.pdf", size: 2411724, date: 1759017600000 },
  { id: 3, name: "Q3_Financials_Draft.pdf", path: "/desktop/Q3_Financials_Draft.pdf", size: 2516582, date: 1759276800000 },
  { id: 4, name: "Logo_HighRes.png", path: "/assets/branding/Logo_HighRes.png", size: 5347737, date: 1736899200000 },
  { id: 5, name: "Logo_print_copy.png", path: "/assets/marketing/Logo_print_copy.png", size: 5347737, date: 1736985600000 },
  { id: 15, name: "Logo_Transparent.png", path: "/assets/branding/Logo_Transparent.png", size: 5033164, date: 1737072000000 },
  { id: 7, name: "DSC00124.jpg", path: "/photos/trip/DSC00124.jpg", size: 13002342, date: 1754956800000 },
  { id: 8, name: "DSC00125.jpg", path: "/photos/trip/DSC00125.jpg", size: 13107200, date: 1754956800000 },
  { id: 9, name: "DSC00126.jpg", path: "/photos/trip/DSC00126.jpg", size: 12897484, date: 1754956800000 },
  { id: 10, name: "tailwind.config.js", path: "/dev/project-alpha/tailwind.config.js", size: 4096, date: 1775001600000 },
  { id: 11, name: "tailwind.config.old.js", path: "/dev/project-alpha/archive/tailwind.config.old.js", size: 3891, date: 1773532800000 },
  { id: 12, name: "config.backup.js", path: "/backups/config.backup.js", size: 4096, date: 1775088000000 },
  { id: 13, name: "Interview_Raw.mp4", path: "/video/raw/Interview_Raw.mp4", size: 1288490188, date: 1765324800000 },
  { id: 14, name: "Interview_Edited_v1.mp4", path: "/video/exports/Interview_Edited_v1.mp4", size: 891289600, date: 1765497600000 },
  { id: 6, name: "system_log.zip", path: "/backups/system_log.zip", size: 1288490188, date: 1710201600000 },
  { id: 16, name: "presentation_notes.txt", path: "/docs/notes.txt", size: 12288, date: 1771545600000 },
];

const MOCK_EDGES: SimilarityEdge[] = [
  { id: 101, source: 1, target: 2, similarity: 0.85 },
  { id: 102, source: 1, target: 3, similarity: 0.98 },
  { id: 103, source: 2, target: 3, similarity: 0.8 },
  { id: 104, source: 4, target: 5, similarity: 0.99 },
  { id: 105, source: 4, target: 15, similarity: 0.92 },
  { id: 106, source: 5, target: 15, similarity: 0.88 },
  { id: 107, source: 7, target: 8, similarity: 0.97 },
  { id: 108, source: 8, target: 9, similarity: 0.96 },
  { id: 109, source: 7, target: 9, similarity: 0.94 },
  { id: 110, source: 10, target: 11, similarity: 0.82 },
  { id: 111, source: 10, target: 12, similarity: 0.99 },
  { id: 112, source: 11, target: 12, similarity: 0.79 },
  { id: 113, source: 13, target: 14, similarity: 0.75 },
  { id: 114, source: 13, target: 1, similarity: 0.75 },
];

export default function DuplicateGraph() {
  const layoutNodes = useMemo(() => calcLayout(MOCK_NODES, MOCK_EDGES), []);
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<number | null>(null);

  const [displayNode, setDisplayNode] = useState<LayoutNode | null>(null);
  const [panelSide, setPanelSide] = useState<PanelSide>("right");
  const [panelShown, setPanelShown] = useState(false);
  const [isClosingPanel, setIsClosingPanel] = useState(false);
  const [panelMetrics, setPanelMetrics] = useState({ panelW: 0, rightBaseX: 0 });
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<number>>(new Set());

  const graphRef = useRef<HTMLDivElement>(null);
  const graphAreaRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hadOpenPanelRef = useRef(false);

  const [graphFitScale, setGraphFitScale] = useState(1);
  const [duplicateThreshold, setDuplicateThreshold] = useState(readDuplicateSimilarityThreshold);

  useEffect(() => {
    const bump = () => setDuplicateThreshold(readDuplicateSimilarityThreshold());
    window.addEventListener("storage", bump);
    window.addEventListener(SFM_SETTINGS_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener("storage", bump);
      window.removeEventListener(SFM_SETTINGS_CHANGED_EVENT, bump);
    };
  }, []);

  const measureGraphAndPanel = useCallback(() => {
    const outer = graphRef.current;
    const area = graphAreaRef.current;
    const p = panelRef.current;
    if (!outer || !area) return;

    const outerW = outer.clientWidth;
    if (p) {
      setPanelMetrics({
        panelW: p.offsetWidth,
        rightBaseX: Math.max(0, outerW - p.offsetWidth - 2 * PANEL_PAD),
      });
    } else {
      setPanelMetrics({
        panelW: 0,
        rightBaseX: Math.max(0, outerW - 2 * PANEL_PAD),
      });
    }

    const w = area.clientWidth;
    const h = area.clientHeight;
    if (w < 32 || h < 32) {
      setGraphFitScale(1);
      return;
    }

    const xs = layoutNodes.map((n) => n.x);
    const ys = layoutNodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanW = ((maxX - minX) / 100) * w;
    const spanH = ((maxY - minY) / 100) * h;

    const nodeBlock = 100;
    const labelAllow = 40;
    const margin = 32;

    const neededW = spanW + nodeBlock * 2 + margin;
    const neededH = spanH + nodeBlock * 2 + labelAllow + margin;
    const fitW = (w - margin) / Math.max(neededW, w * 0.4);
    const fitH = (h - margin) / Math.max(neededH, h * 0.4);
    const s = Math.min(1, fitW, fitH);

    setGraphFitScale(Number.isFinite(s) ? Math.max(0.3, Math.min(1, s)) : 1);
  }, [layoutNodes]);

  useLayoutEffect(() => {
    measureGraphAndPanel();
    const area = graphAreaRef.current;
    const outer = graphRef.current;
    const p = panelRef.current;
    if (!area) return;
    const ro = new ResizeObserver(() => measureGraphAndPanel());
    ro.observe(area);
    if (outer) ro.observe(outer);
    if (p) ro.observe(p);
    return () => ro.disconnect();
  }, [measureGraphAndPanel, activeNodeId, panelSide, panelShown]);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!activeNodeId) return;
      const target = e.target as HTMLElement;

      // Ignore clicks inside the panel itself
      if (panelRef.current?.contains(target)) return;
      
      // Ignore clicks on nodes (they handle their own selection logic)
      if (target.closest('[data-node-btn="true"]')) return;

      beginPanelClose();
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [activeNodeId]);

  useEffect(() => {
    if (!activeNodeId) {
      setPanelShown(false);
      hadOpenPanelRef.current = false;
      setIsClosingPanel(false);
      return;
    }
    setIsClosingPanel(false);
    if (!hadOpenPanelRef.current) {
      setPanelShown(false);
      let alive = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!alive) return;
          setPanelShown(true);
          hadOpenPanelRef.current = true;
        });
      });
      return () => { alive = false; };
    }
    hadOpenPanelRef.current = true;
  }, [activeNodeId]);

  const totalSelectedSize = useMemo(() => {
    let sum = 0;
    selectedForDeletion.forEach((id) => {
      const node = layoutNodes.find((n) => n.id === id);
      if (node) sum += node.size;
    });
    return sum;
  }, [selectedForDeletion, layoutNodes]);
  
  const panelOpen = Boolean(activeNodeId && panelShown);
  const { panelW, rightBaseX } = panelMetrics;

  const skipPanelTransformTransition = Boolean(activeNodeId && !panelShown && !isClosingPanel);

  const panelTranslateX = useMemo(() => {
    if (!activeNodeId || !panelShown) {
      return panelSide === "left" ? -(panelW + PANEL_PAD) : rightBaseX + panelW + PANEL_PAD;
    }
    return panelSide === "left" ? 0 : rightBaseX;
  }, [activeNodeId, panelShown, panelSide, panelW, rightBaseX]);

  const panelOpacity = useMemo(() => {
    if (!activeNodeId) return 0;
    if (panelShown) return 1;
    return isClosingPanel ? 0 : 1;
  }, [activeNodeId, panelShown, isClosingPanel]);

  const beginPanelClose = () => {
    setIsClosingPanel(true);
    setPanelShown(false);
  };

  const handlePanelTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.currentTarget !== e.target) return;
    if (!isClosingPanel) return;
    if (e.propertyName !== "transform") return;
    setIsClosingPanel(false);
    setActiveNodeId(null);
  };

  const adjacentData = useMemo<AdjacentNodeData[]>(() => {
    if (!displayNode) return [];
    const connections = MOCK_EDGES.filter(
      (e) => e.source === displayNode.id || e.target === displayNode.id,
    ).map((e) => {
      const adjacentId = e.source === displayNode.id ? e.target : e.source;
      const node = layoutNodes.find((n) => n.id === adjacentId)!;
      return { node, similarity: e.similarity };
    });
    return connections.sort((a, b) => b.similarity - a.similarity);
  }, [displayNode, layoutNodes]);

  const activeNodeGroupIds = useMemo<Set<number>>(() => {
    if (!activeNodeId) return new Set(layoutNodes.map((n) => n.id));
    const ids = new Set<number>([activeNodeId]);
    MOCK_EDGES.forEach((e) => {
      if (e.source === activeNodeId) ids.add(e.target);
      if (e.target === activeNodeId) ids.add(e.source);
    });
    return ids;
  }, [activeNodeId, layoutNodes]);

  // --- HANDLERS ---
  const handleNodeClick = (id: number) => {
    if (id === activeNodeId) {
      beginPanelClose();
    } else {
      setIsClosingPanel(false);
      if (hadOpenPanelRef.current) setPanelShown(true);
      setActiveNodeId(id);
      const node = layoutNodes.find((n) => n.id === id);
      if (node) {
        setDisplayNode(node);
        setPanelSide(node.x > 50 ? "left" : "right");
      }
    }
    setSelectedForDeletion(new Set());
  };

  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedForDeletion);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedForDeletion(newSet);
  };

  return (
    <div
      ref={graphRef}
      className="relative h-150 w-full overflow-hidden rounded-ui border border-border bg-surface-muted/50 text-foreground shadow-soft dark:bg-surface-muted/30"
    >
      <div className="pointer-events-none absolute -left-1/4 -top-1/4 h-1/2 w-1/2 rounded-full bg-primary/8 blur-3xl dark:bg-primary/15" />
      <div className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-3/5 w-3/5 rounded-full bg-surface-elevated/80 blur-3xl dark:bg-surface-elevated/20" />

      {/* Main Canvas Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 rounded-xl border border-border bg-surface-elevated/90 p-3 text-xs shadow-soft backdrop-blur-md dark:bg-surface-elevated/90">
        <div className="font-semibold text-foreground">Similarity Key</div>
        <div className="flex items-center gap-2 text-foreground-muted">
          <div 
            className="h-1.5 w-6 rounded-full" 
            style={{ background: `linear-gradient(to right, rgb(${EDGE_YELLOW.r}, ${EDGE_YELLOW.g}, ${EDGE_YELLOW.b}), rgb(${EDGE_RED.r}, ${EDGE_RED.g}, ${EDGE_RED.b}))` }} 
          />
          <span>Threshold to 100%</span>
        </div>
      </div>

      <div
        ref={graphAreaRef}
        className="absolute inset-0 box-border p-[clamp(12px,3vw,32px)]"
      >
        <div
          className="relative h-full w-full origin-center transition-transform duration-500 ease-material"
          style={{ transform: `scale(${graphFitScale})` }}
        >
          <svg className="absolute inset-0 h-full w-full pointer-events-none">
            {MOCK_EDGES.map((edge) => {
              const source = layoutNodes.find((n) => n.id === edge.source);
              const target = layoutNodes.find((n) => n.id === edge.target);

              if (!source || !target) return null;

            const edgeInFocus =
                !activeNodeId ||
                edge.source === activeNodeId ||
                edge.target === activeNodeId;
                  
              const isDimmed = Boolean(activeNodeId && !isClosingPanel && !edgeInFocus);
              const strokeCol = similarityEdgeStroke(edge.similarity, duplicateThreshold);
              const brightOpacity = 0.58 + edge.similarity * 0.38;
              const dimOpacity = 0.14;

              return (
                <g 
                  key={edge.id}
                  className="pointer-events-auto cursor-crosshair"
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                >
                  {/* Invisible thick line for easier hovering */}
                  <line
                    x1={`${source.x}%`} y1={`${source.y}%`}
                    x2={`${target.x}%`} y2={`${target.y}%`}
                    stroke="transparent"
                    strokeLinecap="round"
                    strokeWidth={24}
                  />
                  {/* Visible edge line */}
                  <line
                    x1={`${source.x}%`} y1={`${source.y}%`}
                    x2={`${target.x}%`} y2={`${target.y}%`}
                    stroke={strokeCol}
                    strokeLinecap="round"
                    strokeWidth={CONSTANT_EDGE_WIDTH}
                    className="transition-[opacity,stroke,stroke-width] duration-500 ease-material pointer-events-none"
                    style={{ opacity: isDimmed ? dimOpacity : brightOpacity }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Absolute Edge Hover Tooltips */}
          <div className="absolute inset-0 pointer-events-none">
            {hoveredEdgeId !== null && (() => {
              const edge = MOCK_EDGES.find(e => e.id === hoveredEdgeId);
              if (!edge) return null;
              const source = layoutNodes.find(n => n.id === edge.source);
              const target = layoutNodes.find(n => n.id === edge.target);
              if (!source || !target) return null;

              return (
                <div 
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-surface-elevated/95 px-2.5 py-1 text-xs font-bold text-foreground shadow-soft backdrop-blur-md"
                  style={{
                    left: `${(source.x + target.x) / 2}%`,
                    top: `${(source.y + target.y) / 2}%`,
                  }}
                >
                  {(edge.similarity * 100).toFixed(0)}% Match
                </div>
              );
            })()}
          </div>

          <div className="absolute inset-0 h-full w-full pointer-events-none">
            {layoutNodes.map((node) => {
              const isFocused = node.id === activeNodeId && !isClosingPanel;
              const isDimmed = activeNodeId && !isClosingPanel && !activeNodeGroupIds.has(node.id);

              return (
                <div
                  key={node.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-700 ease-out pointer-events-auto"
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                  <div className={`relative flex flex-col items-center transition-[transform,opacity] duration-500 ease-material ${isDimmed ? "scale-[0.88] opacity-[0.22]" : "scale-100 opacity-100"}`}>
                    <button
                      type="button"
                      data-node-btn="true"
                      onClick={() => handleNodeClick(node.id)}
                      className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full shadow-soft transition-[colors,box-shadow,transform] duration-300 ease-material hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated active:scale-95 ${!isDimmed ? "hover:scale-[1.04]" : ""}
                    ${isFocused ? "bg-primary text-on-primary shadow-card" : "bg-surface-elevated text-foreground ring-1 ring-border"}
                  `}
                    >
                      <File size={36} />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-[calc(100%+0.75rem)] z-10 max-w-[min(200px,40vw)] -translate-x-1/2 truncate rounded-full border border-border bg-surface-elevated/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-soft backdrop-blur-sm sm:text-sm">
                      {node.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        ref={panelRef}
        className="absolute top-3 bottom-3 z-20 flex w-[min(22rem,calc(100%-1.5rem))] max-w-[440px] flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated/95 shadow-card backdrop-blur-md dark:bg-surface-elevated/95"
        onTransitionEnd={handlePanelTransitionEnd}
        style={{
          left: PANEL_PAD,
          transform: `translateX(${panelTranslateX}px)`,
          transition: skipPanelTransformTransition ? "none" : PANEL_TRANSITION,
          opacity: panelOpacity,
          pointerEvents: panelOpen ? "auto" : "none",
        }}
      >
        {displayNode && (
          <>
            <div className="shrink-0 border-b border-border p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-soft">
                  <File size={22} />
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex h-9 items-center justify-center gap-2 rounded-full bg-surface-muted px-4 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-surface-elevated hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Open selected file"
                  >
                    <ExternalLink size={14} />
                    <span>Open</span>
                  </button>
                  <button
                    type="button"
                    onClick={beginPanelClose}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted ring-1 ring-transparent transition-colors hover:bg-surface-muted hover:text-foreground hover:ring-border active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Close details"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <h2 className="mb-1 truncate text-base font-semibold sm:text-lg" title={displayNode.name}>
                {displayNode.name}
              </h2>
              <p className="mb-3 truncate text-xs text-foreground-muted sm:text-sm">
                {displayNode.path}
              </p>

              <div className="flex flex-wrap gap-2 text-xs text-foreground-muted">
                <span className="rounded-lg bg-surface-muted px-2.5 py-1 font-medium">
                  {formatBytes(displayNode.size)}
                </span>
                <span className="rounded-lg bg-surface-muted px-2.5 py-1 font-medium">
                  {formatDate(displayNode.date)}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                Potential duplicates ({adjacentData.length})
              </h3>

              {adjacentData.map(({ node, similarity }) => {
                const isSelected = selectedForDeletion.has(node.id);

                return (
                  <div
                    key={node.id}
                    className={`group relative rounded-xl border p-3 transition-all duration-300 ease-material
                      ${isSelected ? "border-primary/35 bg-primary/[0.07]" : "border-transparent bg-surface-muted/60 hover:border-border hover:bg-surface-muted hover:shadow-soft dark:bg-surface-muted/40"}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleSelection(node.id)}
                        className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                          ${isSelected ? "bg-primary text-on-primary" : "border-2 border-border text-transparent hover:border-primary/60"}
                        `}
                        aria-pressed={isSelected}
                        aria-label={isSelected ? "Deselect for deletion" : "Select for deletion"}
                      >
                        <Check size={14} strokeWidth={3} />
                      </button>

                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-muted shadow-sm">
                        <File size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <h4 className="truncate pr-1 text-sm font-medium text-foreground">
                            {node.name}
                          </h4>
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary sm:text-xs">
                            {(similarity * 100).toFixed(0)}% match
                          </span>
                        </div>
                        <p className="mb-2 truncate text-[11px] text-foreground-muted sm:text-xs">
                          {node.path}
                        </p>

                        <div className="mt-1 flex items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-foreground-muted">
                            <span>{formatBytes(node.size)}</span>
                            <span className="text-border" aria-hidden>•</span>
                            <span>{formatDate(node.date)}</span>
                          </div>

                          <button
                            type="button"
                            className="flex h-7 items-center justify-center rounded-full bg-surface-elevated px-3 text-xs font-medium text-foreground ring-1 ring-border transition-colors hover:bg-surface-muted hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Open file location"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-border bg-surface-elevated/90 p-3 sm:p-4 dark:bg-surface-elevated/90">
              <button
                type="button"
                disabled={selectedForDeletion.size === 0}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-300 ease-material focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                  ${selectedForDeletion.size > 0 ? "bg-primary text-on-primary shadow-soft hover:brightness-110 active:scale-[0.99]" : "cursor-not-allowed bg-surface-muted text-foreground-muted"}
                `}
              >
                <Trash2 size={17} />
                Delete selected ({selectedForDeletion.size}) - {formatBytes(totalSelectedSize)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}