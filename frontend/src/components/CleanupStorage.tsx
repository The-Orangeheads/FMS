import {
  useState,
  useMemo,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
} from "react";
import type { TransitionEvent } from "react";
import { File, Check, X, ExternalLink, Trash2, Loader2 } from "lucide-react";
import { addRecentlyOpened } from "./RecentlyOpened";
import {
  readDuplicateSimilarityThreshold,
  SFM_SETTINGS_CHANGED_EVENT,
} from "../libs/sfmSettingsClient";
import { IconFileText, IconFileImage } from "./icons";
import { getCachedThumbnail, setCachedThumbnail } from "../libs/thumbnailCache";
import { getPdfPreview } from "../libs/pdfPreview";


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
  const ms = timestamp > 1e13 ? Math.floor(timestamp / 1e6) : timestamp;
  const date = new Date(ms);
  
  if (isNaN(date.getTime())) return "Unknown Date";
  
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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
  if (!nodes || nodes.length === 0) return [];

  const iters = 400; // Increased iterations for annealing
  const idealDist = 25;
  const kSpring = 0.15;
  const kRepel = 400;
  const kCenter = 0.03;
  const damp = 0.85;
  
  // Hard constraint: nodes must be at least this far apart (percentage of canvas)
  // 12% is roughly enough space to prevent 80px nodes from overlapping
  const minNodeDist = 12; 

  // Pre-calculate degrees to normalize spring forces in dense clusters
  const degree: Record<number, number> = {};
  nodes.forEach((n) => { degree[n.id] = 0; });
  edges.forEach((e) => {
    if (degree[e.source] !== undefined) degree[e.source]++;
    if (degree[e.target] !== undefined) degree[e.target]++;
  });

  const pos: LayoutNode[] = nodes.map((n, i) => {
    const angle = (i * 2 * Math.PI) / nodes.length;
    return {
      ...n,
      // Start in a wider circle so they have room to push each other around
      x: 50 + Math.cos(angle) * 40,
      y: 50 + Math.sin(angle) * 40,
      vx: 0,
      vy: 0,
    };
  });

  for (let i = 0; i < iters; i++) {
    // Simulated annealing: force multiplier cools down from 1.0 to 0.0
    const alpha = 1 - i / iters;

    // 1. Repulsion between all nodes
    for (let a = 0; a < pos.length; a++) {
      for (let b = a + 1; b < pos.length; b++) {
        let dx = pos[a].x - pos[b].x;
        let dy = pos[a].y - pos[b].y;
        let dSq = dx * dx + dy * dy;

        // Prevent math explosion if perfectly overlapping
        if (dSq === 0) {
          dx = (Math.random() - 0.5);
          dy = (Math.random() - 0.5);
          dSq = dx * dx + dy * dy;
        }

        const d = Math.sqrt(dSq);
        const f = (kRepel / dSq) * alpha;
        
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;

        pos[a].vx! += fx;
        pos[a].vy! += fy;
        pos[b].vx! -= fx;
        pos[b].vy! -= fy;
      }
    }

    // 2. Attraction along edges (Springs)
    for (const edge of edges) {
      const aIdx = pos.findIndex((n) => n.id === edge.source);
      const bIdx = pos.findIndex((n) => n.id === edge.target);
      if (aIdx === -1 || bIdx === -1) continue;

      const a = pos[aIdx];
      const b = pos[bIdx];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0) d = 0.01;

      // Normalize by degree to prevent dense clusters from imploding into a singularity
      const linkStrength = 1 / Math.max(1, Math.min(degree[a.id] || 1, degree[b.id] || 1));
      
      const f = kSpring * linkStrength * edge.similarity * (d - idealDist) * alpha;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;

      a.vx! += fx;
      a.vy! += fy;
      b.vx! -= fx;
      b.vy! -= fy;
    }

    // 3. Center gravity, velocity update
    for (const p of pos) {
      p.vx! += (50 - p.x) * kCenter * alpha;
      p.vy! += (50 - p.y) * kCenter * alpha;

      // Clamp max velocity to prevent wild shooting
      p.vx = Math.max(-10, Math.min(10, p.vx!));
      p.vy = Math.max(-10, Math.min(10, p.vy!));

      p.x += p.vx;
      p.y += p.vy;

      p.vx *= damp;
      p.vy *= damp;
    }

    // 4. Hard Collision Resolution (Anti-Overlap)
    // Run multiple mini-passes to resolve cascading overlaps
    for (let k = 0; k < 3; k++) {
      for (let a = 0; a < pos.length; a++) {
        for (let b = a + 1; b < pos.length; b++) {
          let dx = pos[a].x - pos[b].x;
          let dy = pos[a].y - pos[b].y;
          let d = Math.sqrt(dx * dx + dy * dy);
          
          if (d < minNodeDist) {
            if (d === 0) { dx = 0.1; dy = 0.1; d = 0.14; }
            // Move each node back by half the overlapping amount
            const overlap = (minNodeDist - d) / 2;
            const fixX = (dx / d) * overlap;
            const fixY = (dy / d) * overlap;
            
            pos[a].x += fixX;
            pos[a].y += fixY;
            pos[b].x -= fixX;
            pos[b].y -= fixY;
            
            // Kill velocity in the direction of the collision to prevent bouncing
            pos[a].vx! *= 0.5;
            pos[a].vy! *= 0.5;
            pos[b].vx! *= 0.5;
            pos[b].vy! *= 0.5;
          }
        }
      }
    }

    // 5. Bounds Clamping
    for (const p of pos) {
      p.x = Math.max(2, Math.min(98, p.x));
      p.y = Math.max(2, Math.min(98, p.y));
    }
  }

  return pos;
}

function CleanupThumb({ 
  path, 
  containerClass = "h-10 w-10 rounded-lg border border-border bg-surface-muted", 
  iconClass = "h-5 w-5 text-foreground-muted opacity-40" 
}: { 
  path: string, 
  containerClass?: string,
  iconClass?: string 
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path);

  useEffect(() => {
    let isMounted = true;
    
    const loadThumb = async () => {
      if (!path) return;
      const cached = await getCachedThumbnail(path);
      if (cached && isMounted) {
        setPreview(cached);
        return;
      }

      const electron = (window as any).require ? (window as any).require("electron") : null;
      try {
        if (electron?.nativeImage) {
          const thumb = await electron.nativeImage.createThumbnailFromPath(path, { width: 256, height: 256 });
          if (!thumb.isEmpty() && isMounted) {
            const dataUrl = thumb.toDataURL();
            setPreview(dataUrl);
            await setCachedThumbnail(path, dataUrl);
            return;
          }
        }
      } catch (error) {}

      if (path.toLowerCase().endsWith(".pdf") && isMounted) {
        const pdfThumb = await getPdfPreview(path);
        if (pdfThumb && isMounted) {
          setPreview(pdfThumb);
          await setCachedThumbnail(path, pdfThumb);
        }
      }
    };
    loadThumb();
    return () => { isMounted = false; };
  }, [path]);

  if (preview) {
    return (
      <span className={`flex shrink-0 overflow-hidden ${containerClass}`}>
        <img src={preview} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className={`flex shrink-0 items-center justify-center ${containerClass}`}>
      {isImage ? <IconFileImage className={iconClass} /> : <IconFileText className={iconClass} />}
    </span>
  );
}

export default function DuplicateGraph() {
    const electron = (window as any).require
    ? (window as any).require("electron")
    : null;
  // --- GRAPH DATA STATE ---
  const [graphNodes, setGraphNodes] = useState<FileNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<SimilarityEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Layout calculated dynamically when data changes
  const layoutNodes = useMemo(() => calcLayout(graphNodes, graphEdges), [graphNodes, graphEdges]);

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

  // --- DATA FETCHING ---
// --- DATA FETCHING ---
  const fetchPage = useCallback(async (page: number) => {
    setIsLoading(true);
    setGraphNodes([]);
    setGraphEdges([]);
    
    // Reset local UI states when fetching new data
    setActiveNodeId(null);
    setDisplayNode(null);
    setPanelShown(false);
    setIsClosingPanel(false);
    setSelectedForDeletion(new Set());
    hadOpenPanelRef.current = false;

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/duplicates/get_dupes?page=${page}`);
      if (!response.ok) {
        throw new Error("Failed to fetch duplicates data");
      }
      
      const data = await response.json();

      // Transform backend edges [source, target, similarity] to internal format
      const formattedEdges: SimilarityEdge[] = (data.edges || []).map((edge: any, index: number) => ({
        id: index, // Backend doesn't provide edge ID, generating one
        source: edge[0],
        target: edge[1],
        similarity: edge[2],
      }));

      // Create a Set containing all node IDs that have at least one edge
      const nodesWithEdges = new Set<number>();
      formattedEdges.forEach((edge) => {
        nodesWithEdges.add(edge.source);
        nodesWithEdges.add(edge.target);
      });

      // Transform backend nodes to internal format AND filter out isolated nodes
      const formattedNodes: FileNode[] = (data.nodes || [])
        .filter((node: any) => nodesWithEdges.has(node.id)) // <-- NEW FILTER HERE
        .map((node: any) => {
          // Extract filename from path (handles both / and \ separators)
          const fileName = String(node.path).split(/[/\\]/).pop() || "Unknown File";
          
          return {
            id: node.id,
            name: fileName,
            path: node.path,
            size: node.file_size,
            date: node.modify_date,
          };
        });

      setGraphNodes(formattedNodes);
      setGraphEdges(formattedEdges);
    } catch (error) {
      console.error("Error fetching duplicates:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch initial page on mount
  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);


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
    if (w < 32 || h < 32 || layoutNodes.length === 0) {
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
    const connections = graphEdges.filter(
      (e) => e.source === displayNode.id || e.target === displayNode.id,
    ).map((e) => {
      const adjacentId = e.source === displayNode.id ? e.target : e.source;
      const node = layoutNodes.find((n) => n.id === adjacentId)!;
      return { node, similarity: e.similarity };
    });
    return connections.sort((a, b) => b.similarity - a.similarity);
  }, [displayNode, layoutNodes, graphEdges]);

  const activeNodeGroupIds = useMemo<Set<number>>(() => {
    if (!activeNodeId) return new Set(layoutNodes.map((n) => n.id));
    const ids = new Set<number>([activeNodeId]);
    graphEdges.forEach((e) => {
      if (e.source === activeNodeId) ids.add(e.target);
      if (e.target === activeNodeId) ids.add(e.source);
    });
    return ids;
  }, [activeNodeId, layoutNodes, graphEdges]);

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
      className="isolate relative h-150 w-full overflow-hidden rounded-ui border border-border bg-surface-muted/50 text-foreground shadow-soft dark:bg-surface-muted/30"
    >
      <div className="pointer-events-none absolute -left-1/4 -top-1/4 h-1/2 w-1/2 rounded-full bg-primary/8 blur-3xl dark:bg-primary/15" />
      <div className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-3/5 w-3/5 rounded-full bg-surface-elevated/80 blur-3xl dark:bg-surface-elevated/20" />

      {/* LOADING STATE */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface-muted/20 backdrop-blur-[2px]">
          <Loader2 className="animate-spin text-primary mb-3" size={42} />
          <p className="text-sm font-medium text-foreground">Analyzing file duplicates...</p>
        </div>
      )}

      {/* EMPTY STATE */}
      {!isLoading && graphNodes.length === 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <p className="text-base font-medium text-foreground-muted">
            No duplicates found for this page.
          </p>
        </div>
      )}

      {!isLoading && graphNodes.length > 0 && (
        <>
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
                {graphEdges.map((edge) => {
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
                  const edge = graphEdges.find(e => e.id === hoveredEdgeId);
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
                          className={`relative flex h-20 w-20 overflow-hidden shrink-0 items-center justify-center rounded-full shadow-soft transition-[colors,box-shadow,transform,box-shadow] duration-300 ease-material hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated active:scale-95 ${!isDimmed ? "hover:scale-[1.04]" : ""}
                        ${isFocused ? "ring-4 ring-primary shadow-card" : "ring-4 ring-border/50 bg-surface-elevated"}
                      `}
                        >
                          <CleanupThumb 
                            path={node.path} 
                            containerClass="h-full w-full bg-surface-elevated" 
                            iconClass="h-8 w-8 text-foreground-muted opacity-40" 
                          />
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
        </>
      )}

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
                <CleanupThumb 
                  path={displayNode.path} 
                  containerClass="h-14 w-14 shrink-0 rounded-xl border border-border bg-surface-muted shadow-soft" 
                  iconClass="h-6 w-6 text-foreground-muted opacity-40" 
                />
                
                  <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!electron?.ipcRenderer || !displayNode.path) return;
                      try {
                        await electron.ipcRenderer.invoke("open-file-in-os", displayNode.path);
                        addRecentlyOpened(displayNode.path);
                      } catch (error) {
                        console.error("Failed to open file:", error);
                      }
                    }}
                    className="flex h-9 items-center justify-center rounded-full bg-surface-muted px-4 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-surface-elevated hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Open selected file"
                  >
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

                      <div className="mt-0.5">
                        <CleanupThumb path={node.path} />
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
                            onClick={async () => {
                              if (!electron?.ipcRenderer || !node.path) return;
                              try {
                                await electron.ipcRenderer.invoke("open-file-in-os", node.path);
                                addRecentlyOpened(node.path);
                              } catch (error) {
                                console.error("Failed to open file:", error);
                              }
                            }}
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