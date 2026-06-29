import {
  useState,
  useMemo,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
} from "react";
import type { TransitionEvent } from "react";
import { Check, X, Trash2, Loader2, RefreshCw, ChevronLeft, ChevronRight, Network, List, ChevronDown } from "lucide-react";
import { addRecentlyOpened } from "./RecentlyOpened";
import {
  readDuplicateSimilarityThreshold,
  SFM_SETTINGS_CHANGED_EVENT,
} from "../libs/sfmSettingsClient";
import { IconFileText, IconFileImage } from "./icons";
import { getCachedThumbnail, setCachedThumbnail } from "../libs/thumbnailCache";
import { getPdfPreview } from "../libs/pdfPreview";
import LayoutWorker from "../workers/layoutWorker?worker";
import { API_URL } from "../config";
import toast from "react-hot-toast";


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

    try {
        if (window.electron?.ipcRenderer) {
          const dataUrl = await window.electron.ipcRenderer.invoke('get-file-thumbnail', path);
          if (dataUrl && isMounted) {
            setPreview(dataUrl);
            await setCachedThumbnail(path, dataUrl);
            return;
          }
        }
      } catch (error) {
        // Fallback
      }

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
// --- GRAPH DATA STATE ---
  const [graphNodes, setGraphNodes] = useState<FileNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<SimilarityEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New async layout state
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    // If there's no data, clear the layout immediately
    if (graphNodes.length === 0) {
      setLayoutNodes([]);
      return;
    }

    setIsCalculating(true);
    
    // Spawn a new background worker
    const worker = new LayoutWorker();

    // Listen for the completed layout
    worker.onmessage = (e) => {
      setLayoutNodes(e.data);
      setIsCalculating(false);
      worker.terminate();
    };

    // Send the raw data to the worker to process
    worker.postMessage({ nodes: graphNodes, edges: graphEdges });

    // Cleanup function to terminate the worker if the component unmounts 
    // or if the data changes before the current calculation finishes
    return () => {
      worker.terminate();
    };
  }, [graphNodes, graphEdges]);

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

  const [hasFailed, setHasFailed] = useState(false); // Track if a retry is active
  const activePageRef = useRef<number>(0); // Ensure retries match the current page
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [minimizedClusters, setMinimizedClusters] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // --- DATA FETCHING ---
  const fetchPage = useCallback(async (page: number) => {
    setIsLoading(true);
    setHasFailed(false);
    activePageRef.current = page;
    setCurrentPage(page);
    
    // Reset local UI states
    setGraphNodes([]);
    setGraphEdges([]);
    setActiveNodeId(null);
    setDisplayNode(null);
    setPanelShown(false);
    setIsClosingPanel(false);
    setSelectedForDeletion(new Set());
    hadOpenPanelRef.current = false;
    setMinimizedClusters(new Set());

    const performFetch = async () => {
      // If the user has changed the page while we were retrying, stop this loop
      if (activePageRef.current !== page) return;

      try {
        const response = await fetch(`${API_URL}/api/duplicates/get_dupes?page=${page}`);
        if (!response.ok) {
          throw new Error("Failed to fetch duplicates data");
        }
        
        const data = await response.json();

        // Transform backend edges [source, target, similarity] to internal format
        const formattedEdges: SimilarityEdge[] = (data.edges || []).map((edge: any, index: number) => ({
          id: index,
          source: edge[0],
          target: edge[1],
          similarity: edge[2],
        }));

        const nodesWithEdges = new Set<number>();
        formattedEdges.forEach((edge) => {
          nodesWithEdges.add(edge.source);
          nodesWithEdges.add(edge.target);
        });

        // Transform backend nodes and filter isolated nodes
        const formattedNodes: FileNode[] = (data.nodes || [])
          .filter((node: any) => nodesWithEdges.has(node.id))
          .map((node: any) => {
            const fileName = String(node.path).split(/[/\\]/).pop() || "Unknown File";
            return {
              id: node.id,
              name: fileName,
              path: node.path,
              size: node.file_size,
              date: node.modify_date,
            };
          });

        if (activePageRef.current === page) {
          setGraphNodes(formattedNodes);
          setGraphEdges(formattedEdges);
          setIsLoading(false); // Only stop loading on success
          setHasFailed(false);
        }
      } catch (error) {
        console.error("Error fetching duplicates, retrying in 3s...", error);
        if (activePageRef.current === page) {
          setHasFailed(true);
          // Keep isLoading(true) and try again after a delay
          setTimeout(performFetch, 3000);
        }
      }
    };

    performFetch();
  }, []);

  const handleSync = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/duplicates/dupe_sync`, { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
    } catch (err) {
      console.error("Failed to sync duplicates", err);
      toast.error("Failed to sync duplicates");
    }
    fetchPage(currentPage);
  };

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

  const listClusters = useMemo(() => {
    const adj = new Map<number, { id: number; similarity: number }[]>();
    graphNodes.forEach((n) => adj.set(n.id, []));
    graphEdges.forEach((e) => {
      if (e.similarity >= duplicateThreshold) {
        adj.get(e.source)?.push({ id: e.target, similarity: e.similarity });
        adj.get(e.target)?.push({ id: e.source, similarity: e.similarity });
      }
    });

    const visited = new Set<number>();
    const clusters: { nodes: (FileNode & { maxSimilarity: number })[] }[] = [];

    graphNodes.forEach((n) => {
      if (!visited.has(n.id)) {
        const clusterNodes: (FileNode & { maxSimilarity: number })[] = [];
        const q = [n.id];
        visited.add(n.id);

        while (q.length > 0) {
          const curId = q.shift()!;
          const nodeData = graphNodes.find((nd) => nd.id === curId);
          if (!nodeData) continue;
          
          let maxSim = 0;
          if (adj.get(curId)) {
            const sims = adj.get(curId)!.map(e => e.similarity);
            if (sims.length > 0) maxSim = Math.max(...sims);
          }
          
          clusterNodes.push({ ...nodeData, maxSimilarity: maxSim });

          adj.get(curId)?.forEach((neighbor) => {
            if (!visited.has(neighbor.id)) {
              visited.add(neighbor.id);
              q.push(neighbor.id);
            }
          });
        }
        
        clusters.push({ nodes: clusterNodes.sort((a, b) => b.size - a.size) });
      }
    });

    return clusters.sort((a, b) => b.nodes.length - a.nodes.length);
  }, [graphNodes, graphEdges, duplicateThreshold]);

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

  const toggleClusterSelection = (clusterIndex: number, selectAll: boolean) => {
    const newSet = new Set(selectedForDeletion);
    const cluster = listClusters[clusterIndex];
    if (selectAll) {
      cluster.nodes.forEach(n => newSet.add(n.id));
    } else {
      cluster.nodes.forEach(n => newSet.delete(n.id));
    }
    setSelectedForDeletion(newSet);
  };

  const toggleCluster = (index: number) => {
    const newSet = new Set(minimizedClusters);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setMinimizedClusters(newSet);
  };

  const handleDelete = async () => {
    if (selectedForDeletion.size === 0 || isDeleting) return;
    
    // Get paths of selected nodes
    const filePaths = Array.from(selectedForDeletion).map(id => {
      const node = graphNodes.find(n => n.id === id);
      return node?.path;
    }).filter(Boolean) as string[];

    if (filePaths.length === 0) return;

    if (!window.electron?.ipcRenderer) {
      toast.error("Electron IPC not available");
      return;
    }

    setIsDeleting(true);
    try {
      const result = await window.electron.ipcRenderer.invoke('delete-files', filePaths);
      
      if (result?.ok) {
        toast.success(`Moved ${filePaths.length} file(s) to trash`);
        
        // Optimistically remove deleted nodes
        setGraphNodes(prev => prev.filter(n => !selectedForDeletion.has(n.id)));
        setGraphEdges(prev => prev.filter(e => !selectedForDeletion.has(e.source) && !selectedForDeletion.has(e.target)));
        
        // If panel was open and the display node was deleted, close panel
        if (displayNode && selectedForDeletion.has(displayNode.id)) {
          setPanelShown(false);
          setDisplayNode(null);
          setActiveNodeId(null);
        }
        
        setSelectedForDeletion(new Set());
        // Trigger a background resync just in case
        window.fetch("/api/duplicates/dupe_sync", { method: "POST" }).catch(() => {});
      } else {
        toast.error(`Failed to delete files: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error("Failed to communicate with the OS");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full h-full">
      <div
        ref={graphRef}
        className="isolate relative h-150 w-full overflow-hidden rounded-ui border border-border bg-surface-muted/50 text-foreground shadow-soft dark:bg-surface-muted/30"
      >
        <div className="pointer-events-none absolute -left-1/4 -top-1/4 h-1/2 w-1/2 rounded-full bg-primary/8 blur-3xl dark:bg-primary/15" />
      <div className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-3/5 w-3/5 rounded-full bg-surface-elevated/80 blur-3xl dark:bg-surface-elevated/20" />

    {/* LOADING STATE */}
      {(isLoading || isCalculating) && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface-muted/20 backdrop-blur-[2px]">
          <Loader2 className="animate-spin text-primary mb-3" size={42} />
          <p className="text-sm font-medium text-foreground">
            {isCalculating 
              ? "Calculating visual layout..." 
              : hasFailed 
                ? "Retring to fetch file duplicates..." 
                : "Fetching file duplicates..."}
          </p>
          {hasFailed && !isCalculating && (
            <p className="mt-2 text-xs text-foreground-muted animate-pulse">
              Taking longer than expected to respond.
            </p>
          )}
        </div>
      )}

      {/* EMPTY STATE */}
      {(!isLoading && !isCalculating) && graphNodes.length === 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <p className="text-base font-medium text-foreground-muted">
            No duplicates found for this page.
          </p>
        </div>
      )}

      {(!isLoading && !isCalculating) && graphNodes.length > 0 && viewMode === "list" && (
        <>
          <div className="absolute inset-0 z-10 overflow-y-auto p-4 sm:p-6 pb-24 bg-surface-muted/20 scrollbar-hidden">
            <div className="mx-auto max-w-5xl space-y-6 mt-4">
              {listClusters.map((cluster, i) => {
                const clusterSize = cluster.nodes.reduce((sum, n) => sum + n.size, 0);
                const allSelected = cluster.nodes.every(n => selectedForDeletion.has(n.id));
                const isMinimized = minimizedClusters.has(i);

                return (
                  <div key={i} className="rounded-xl border border-border bg-surface-elevated shadow-card overflow-hidden">
                    <div className="bg-surface-muted/50 px-4 py-3 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleCluster(i)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated text-foreground-muted ring-1 ring-border transition-all hover:bg-surface-muted hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title={isMinimized ? "Expand cluster" : "Collapse cluster"}
                        >
                          <ChevronDown size={16} className={`transition-transform duration-300 ease-in-out ${isMinimized ? '-rotate-90' : ''}`} />
                        </button>
                        <h3 className="font-semibold text-foreground text-sm">Cluster {i + 1} <span className="text-foreground-muted font-normal">({cluster.nodes.length} files)</span></h3>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                          {formatBytes(clusterSize)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleClusterSelection(i, !allSelected)}
                        className="flex h-7 items-center justify-center rounded-full bg-surface-elevated px-3 text-xs font-medium text-foreground ring-1 ring-border transition-colors hover:bg-surface-muted hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {allSelected ? "Deselect All" : "Select All"}
                      </button>
                    </div>
                    <div 
                      className="grid transition-all duration-300 ease-in-out"
                      style={{ gridTemplateRows: isMinimized ? '0fr' : '1fr' }}
                    >
                      <div className="overflow-hidden">
                        <div className="divide-y divide-border">
                        {cluster.nodes.map(node => {
                          const isSelected = selectedForDeletion.has(node.id);
                          return (
                            <div key={node.id} className={`flex items-start gap-4 p-4 transition-colors ${isSelected ? "bg-primary/[0.07]" : "hover:bg-surface-muted/30"}`}>
                              <button
                                type="button"
                                onClick={() => toggleSelection(node.id)}
                                className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                                  ${isSelected ? "bg-primary text-on-primary" : "border-2 border-border text-transparent hover:border-primary/60"}
                                `}
                              >
                                <Check size={14} strokeWidth={3} />
                              </button>
                              
                              <CleanupThumb path={node.path} containerClass="h-12 w-12 rounded-lg border border-border bg-surface-muted shrink-0" iconClass="h-6 w-6 text-foreground-muted opacity-40" />
                              
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h4 className="truncate text-sm font-medium text-foreground" title={node.name}>{node.name}</h4>
                                </div>
                                <p className="truncate text-xs text-foreground-muted mb-2" title={node.path}>{node.path}</p>
                                <div className="flex items-center gap-3 text-xs text-foreground-muted">
                                  <span className="font-medium bg-surface-muted px-2 py-0.5 rounded">{formatBytes(node.size)}</span>
                                  <span className="font-medium bg-surface-muted px-2 py-0.5 rounded">{formatDate(node.date)}</span>
                                  <div className="flex-1" />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!window.electron?.ipcRenderer || !node.path) return;
                                      try {
                                        const result = await window.electron.ipcRenderer.invoke("open-file-in-os", node.path);
                                        if (!result?.ok) toast.error("Could not open file.");
                                        else addRecentlyOpened(node.path);
                                      } catch (error) {
                                        toast.error("Failed to communicate with the operating system.");
                                      }
                                    }}
                                    className="flex h-7 items-center justify-center rounded-full bg-surface-elevated px-3 text-xs font-medium text-foreground ring-1 ring-border transition-colors hover:bg-surface-muted hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    Open
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedForDeletion.size > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-4 rounded-xl border border-border bg-surface-elevated/95 shadow-card backdrop-blur-md p-2">
              <div className="px-3 text-sm font-medium text-foreground">
                {selectedForDeletion.size} selected ({formatBytes(totalSelectedSize)})
              </div>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait"
              >
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          )}
        </>
      )}

      {(!isLoading && !isCalculating) && graphNodes.length > 0 && viewMode === "graph" && (
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
        className={`absolute top-3 bottom-3 z-20 flex w-[min(22rem,calc(100%-1.5rem))] max-w-[440px] flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated/95 shadow-card backdrop-blur-md dark:bg-surface-elevated/95 ${viewMode === "list" ? "hidden" : ""}`}
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
                      if (!window.electron?.ipcRenderer || !displayNode.path) return;
                      try {
                        const result = await window.electron.ipcRenderer.invoke("open-file-in-os", displayNode.path);
                        if (!result?.ok) {
                          toast.error("Could not open file. It may have been moved or deleted.");
                          return;
                        }
                        addRecentlyOpened(displayNode.path);
                      } catch (error) {
                        toast.error("Failed to communicate with the operating system.");
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

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4 scrollbar-hidden">
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
                              if (!window.electron?.ipcRenderer || !node.path) return;
                              try {
                                const result = await window.electron.ipcRenderer.invoke("open-file-in-os", node.path);
                                if (!result?.ok) {
                                  toast.error("Could not open file. It may have been moved or deleted.");
                                  return;
                                }
                                addRecentlyOpened(node.path);
                              } catch (error) {
                                toast.error("Failed to communicate with the operating system.");
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
                onClick={handleDelete}
                disabled={selectedForDeletion.size === 0 || isDeleting}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-300 ease-material focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                  ${selectedForDeletion.size > 0 && !isDeleting ? "bg-primary text-on-primary shadow-soft hover:brightness-110 active:scale-[0.99]" : "cursor-not-allowed bg-surface-muted text-foreground-muted"}
                `}
              >
                {isDeleting ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                {isDeleting ? "Deleting..." : `Delete selected (${selectedForDeletion.size}) - ${formatBytes(totalSelectedSize)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>

      {/* Controls below the duplicate detection panel */}
      <div className="flex w-full items-center justify-end">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-elevated/90 p-1.5 shadow-soft dark:bg-surface-elevated/90">
          <div className="flex items-center gap-1 bg-surface-muted rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("graph")}
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${viewMode === "graph" ? "bg-surface-elevated text-primary shadow-sm" : "text-foreground-muted hover:text-foreground"}`}
              title="Graph View"
            >
              <Network size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${viewMode === "list" ? "bg-surface-elevated text-primary shadow-sm" : "text-foreground-muted hover:text-foreground"}`}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>
          <div className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => fetchPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0 || isLoading || isCalculating}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous Page"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[4rem] text-center text-sm font-medium text-foreground">
            Page {currentPage + 1}
          </span>
          <button
            type="button"
            onClick={() => fetchPage(currentPage + 1)}
            disabled={isLoading || isCalculating || graphNodes.length === 0}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next Page"
          >
            <ChevronRight size={18} />
          </button>
          <div className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={handleSync}
            disabled={isLoading || isCalculating}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Sync / Refresh"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
    </div>
  );
}