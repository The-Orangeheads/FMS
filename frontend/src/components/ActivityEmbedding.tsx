import { useCallback, useEffect, useState, type MouseEvent, memo } from "react";
import { IconFileText } from "./icons";

type Completed = { id: string; name: string; durationLabel: string };
type Queued = { id: string; name: string };
type ActivePhase = "preprocessing" | "embedding";

type Active = {
  id: string;
  name: string;
  phase: ActivePhase;
  progress: number;
  detailText: string;
  completedFiles: number;
  totalFiles: number;
};

// Fixed: added queue to START_SYNC, added SYNC_COMPLETE
type BackendMessage =
  | { 
    type: "START_SYNC";
    total: number;
    queue: Queued[];
    analytics: { [key: string]: number[] };
  }
  | {
      type: "SYNC_PROGRESS";
      current_file: string;
      progress: number;
      remaining: number;
      duration_seconds?: number;
      analytics?: { [key: string]: number[] };
    }
  | { type: "FILE_STATUS"; message: string }
  | { type: "SYNC_ERROR"; file: string; error: string }
  | { type: "SYNC_COMPLETE" };

const HISTORY_KEY = "shelf-embedding-history";
const HISTORY_UPDATED_EVENT = "shelf-embedding-history-updated";
const EMBEDDING_UI_UPDATED_EVENT = "shelf-embedding-ui-updated";
const WS_URL = "ws://localhost:8000/ws";

let sharedSocket: WebSocket | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
type SharedEmbeddingState = {
  active: Active | null;
  queue: Queued[];
  error: string | null;
  resyncing: boolean;
  totalFiles: number;
  completedFiles: number;
  currentFileFraction: number;
  analytics: { [key: string]: number[] } | null;
};
let sharedState: SharedEmbeddingState = {
  active: null,
  queue: [],
  error: null,
  resyncing: false,
  totalFiles: 0,
  completedFiles: 0,
  currentFileFraction: 0,
  analytics: null,
};

function readHistoryFromStorage(): Completed[] {
  const stored = window.localStorage.getItem(HISTORY_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as Completed[];
  } catch {
    return [];
  }
}

function writeHistoryToStorage(history: Completed[]) {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  window.dispatchEvent(new CustomEvent(HISTORY_UPDATED_EVENT, { detail: history }));
}

function clearHistoryFromStorage() {
  window.localStorage.removeItem(HISTORY_KEY);
  window.dispatchEvent(new CustomEvent(HISTORY_UPDATED_EVENT, { detail: [] }));
}

function broadcastUiState() {
  window.dispatchEvent(new CustomEvent(EMBEDDING_UI_UPDATED_EVENT, { detail: sharedState }));
}

function parseStatusMessage(message: string) {
  const progressFormat = /^(.+?)\s*:\s*(.+?)\s*:\s*(\d{1,3})\s*$/i.exec(message);
  if (progressFormat) {
    const phaseText = progressFormat[1].trim();
    const fileName = progressFormat[2].trim();
    const percentage = Math.max(1, Math.min(100, Number(progressFormat[3])));
    return { fileName, phaseText, percentage };
  }

  const parts = message.split(": ");
  const fileName = parts.length > 1 ? parts[parts.length - 1].trim() : "";
  const phaseRaw = parts[0]?.trim() ?? "";
  const phaseText = phaseRaw.length > 0 ? phaseRaw : "Processing";
  return { fileName, phaseText, percentage: undefined as number | undefined };
}

function appendEmbeddingHistoryEntry(currentFile: string, durationSeconds?: number) {
  const prev = readHistoryFromStorage();
  const updated = [
    {
      id: Date.now().toString(),
      name: currentFile,
      durationLabel: formatDurationLabel(durationSeconds),
    },
    ...prev,
  ].slice(0, 50);
  writeHistoryToStorage(updated);
}

/** Single handler so multiple ActivityEmbedding mounts do not double-count progress. */
function applyEmbeddingWsMessage(data: BackendMessage) {
  switch (data.type) {
    case "START_SYNC":
      sharedState = {
        ...sharedState,
        error: null,
        resyncing: false,
        queue: data.queue,
        totalFiles: data.total,
        completedFiles: 0,
        currentFileFraction: 0,
        active: null,
        analytics: data.analytics,
      };
      broadcastUiState();
      break;

    case "FILE_STATUS": {
      const parsed = parseStatusMessage(data.message);
      let fraction = sharedState.currentFileFraction;
      if (typeof parsed.percentage === "number") {
        fraction = parsed.percentage / 100;
      }
      const currentFileProgress =
        typeof parsed.percentage === "number"
          ? parsed.percentage
          : Math.max(0, Math.min(100, Math.round(fraction * 100)));
      const activeName =
        parsed.fileName ||
        sharedState.active?.name ||
        sharedState.queue[0]?.name ||
        "";
      if (!activeName) break;

      const nextActive: Active = {
        id: "active-job",
        name: activeName,
        phase: "embedding",
        progress: currentFileProgress,
        detailText: parsed.phaseText,
        completedFiles: sharedState.completedFiles,
        totalFiles: sharedState.totalFiles,
      };
      sharedState = {
        ...sharedState,
        active: nextActive,
        currentFileFraction: fraction,
      };
      broadcastUiState();
      break;
    }

    case "SYNC_PROGRESS": {
      const total = sharedState.totalFiles;
      let completed = sharedState.completedFiles + 1;
      if (total > 0) {
        completed = Math.min(completed, total);
      }
      const completedActive: Active = {
        id: "active-job",
        name: data.current_file,
        phase: "embedding",
        progress: 100,
        detailText: "Embedding complete",
        completedFiles: completed,
        totalFiles: total,
      };
      const baseQueue = sharedState.queue.length > 0 ? sharedState.queue.slice(1) : [];
      const nextQueue =
        data.remaining <= 0 ? [] : baseQueue.slice(0, Math.max(data.remaining, 0));
      sharedState = {
        ...sharedState,
        active: completedActive,
        queue: nextQueue,
        completedFiles: completed,
        totalFiles: total,
        currentFileFraction: 0,
        analytics: data.analytics ?? sharedState.analytics,
      };
      broadcastUiState();
      if (data.current_file) {
        appendEmbeddingHistoryEntry(data.current_file, data.duration_seconds);
      }
      break;
    }

    case "SYNC_COMPLETE":
      sharedState = {
        ...sharedState,
        active: null,
        resyncing: false,
        queue: [],
        totalFiles: 0,
        completedFiles: 0,
        currentFileFraction: 0,
      };
      broadcastUiState();
      break;

    case "SYNC_ERROR":
      sharedState = {
        ...sharedState,
        error: `Error processing ${data.file}: ${data.error}`,
        resyncing: false,
      };
      broadcastUiState();
      break;
  }
}

function formatDurationLabel(durationSeconds?: number): string {
  if (typeof durationSeconds !== "number" || Number.isNaN(durationSeconds)) {
    return "Embedded";
  }
  if (durationSeconds < 1) {
    return `${Math.max(Math.round(durationSeconds * 1000), 1)} ms`;
  }
  return `${durationSeconds.toFixed(durationSeconds >= 10 ? 1 : 2)} s`;
}

function ensureSharedSocketConnection() {
  if (sharedSocket && (sharedSocket.readyState === WebSocket.OPEN || sharedSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  sharedSocket = new WebSocket(WS_URL);
  sharedSocket.onopen = () => {
    reconnectAttempts = 0;
  };
  sharedSocket.onmessage = (event) => {
    try {
      const data: BackendMessage = JSON.parse(event.data);
      applyEmbeddingWsMessage(data);
    } catch (err) {
      console.error("Error parsing WebSocket message:", err);
    }
  };
  sharedSocket.onclose = () => {
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts += 1;
      const delay = Math.min(2000 * reconnectAttempts, 15000);
      setTimeout(() => {
        ensureSharedSocketConnection();
      }, delay);
    }
  };
  sharedSocket.onerror = () => {
    sharedSocket?.close();
  };
}

interface SyncButtonProps {
  resyncing: boolean;
  onSync: (event: MouseEvent<HTMLButtonElement>) => void;
}

const SyncButton = memo(function SyncButton({ resyncing, onSync }: SyncButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={onSync}
      onClick={(event) => event.preventDefault()}
      disabled={resyncing}
      title="Resync embedding queue"
      aria-label="Resync embedding files"
      className="inline-flex items-center justify-center rounded-full p-2 text-foreground-muted hover:bg-surface-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <svg
        className="h-4 w-4 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          animation: resyncing ? 'spin 1s linear infinite' : 'none',
          transformOrigin: '50% 50%',
          transformBox: 'fill-box',
          willChange: 'transform',
          stroke: 'currentColor',
          display: 'block'
        }}
      >
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
      </svg>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}, (prevProps, nextProps) => {
  return prevProps.resyncing === nextProps.resyncing && prevProps.onSync === nextProps.onSync;
});

export function ActivityEmbedding({
  onViewAll,
  showFull,
  onAnalyticsUpdate,
}: {
  onViewAll?: () => void;
  showFull?: boolean;
  onAnalyticsUpdate?: (analytics: { [key: string]: number[] } | null) => void;
}) {
  const [active, setActive] = useState<Active | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [history, setHistory] = useState<Completed[]>(() => readHistoryFromStorage());
  const [resyncing, setResyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embeddingMeta, setEmbeddingMeta] = useState({
    totalFiles: sharedState.totalFiles,
    completedFiles: sharedState.completedFiles,
    currentFileFraction: sharedState.currentFileFraction,
  });
  const [analytics, setAnalytics] = useState<{ [key: string]: number[] } | null>(
    sharedState.analytics
  );

  useEffect(() => {
    setActive(sharedState.active);
    setQueue(sharedState.queue);
    setError(sharedState.error);
    setResyncing(sharedState.resyncing);
    setEmbeddingMeta({
      totalFiles: sharedState.totalFiles,
      completedFiles: sharedState.completedFiles,
      currentFileFraction: sharedState.currentFileFraction,
    });
    setAnalytics(sharedState.analytics);
    ensureSharedSocketConnection();
  }, []);

  useEffect(() => {
    const onUiUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<SharedEmbeddingState>;
      const next = customEvent.detail;
      if (!next) return;
      setActive(next.active);
      setQueue(next.queue);
      setError(next.error);
      setResyncing(next.resyncing);
      setEmbeddingMeta({
        totalFiles: next.totalFiles,
        completedFiles: next.completedFiles,
        currentFileFraction: next.currentFileFraction,
      });
      setAnalytics(next.analytics);
    };
    window.addEventListener(EMBEDDING_UI_UPDATED_EVENT, onUiUpdated as EventListener);
    const onHistoryUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<Completed[]>;
      setHistory(customEvent.detail ?? []);
    };
    window.addEventListener(HISTORY_UPDATED_EVENT, onHistoryUpdated as EventListener);
    return () => {
      window.removeEventListener(EMBEDDING_UI_UPDATED_EVENT, onUiUpdated as EventListener);
      window.removeEventListener(HISTORY_UPDATED_EVENT, onHistoryUpdated as EventListener);
    };
  }, []);

  const handleSync = useCallback(async () => {
    setResyncing(true);
    setError(null);
    sharedState = {
      ...sharedState,
      resyncing: true,
      error: null,
    };
    broadcastUiState();
    try {
      const response = await fetch("http://localhost:8000/api/directory/sync", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }
    } catch (err) {
      console.error("Sync failed:", err);
      setError("Failed to start sync. Please try again.");
      setResyncing(false);
      sharedState = {
        ...sharedState,
        error: "Failed to start sync. Please try again.",
        resyncing: false,
      };
      broadcastUiState();
    }
  }, []);

  const handleSyncMouseDown = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (resyncing) return;
      void handleSync();
    },
    [handleSync]
  );

  const handleViewAllMouseDown = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onViewAll?.();
    },
    [onViewAll]
  );

  const handleClearHistoryMouseDown = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setHistory([]);
      clearHistoryFromStorage();
    },
    []
  );

  useEffect(() => {
    onAnalyticsUpdate?.(analytics);
  }, [analytics, onAnalyticsUpdate]);

  const sidebarPreviewLimit = 5;
  const queueWithoutActive = active
    ? queue.filter((job) => job.name !== active.name)
    : queue;
  const adjustedVisibleQueueCount = !showFull
    ? Math.min(queueWithoutActive.length, sidebarPreviewLimit)
    : queueWithoutActive.length;
  const adjustedRemainingSlotsForHistory = !showFull
    ? Math.max(sidebarPreviewLimit - adjustedVisibleQueueCount, 0)
    : history.length;
  const adjustedVisibleHistoryCount = !showFull
    ? Math.min(history.length, adjustedRemainingSlotsForHistory)
    : history.length;
  const hiddenCount = !showFull
    ? Math.max(
        queueWithoutActive.length +
          history.length -
          (adjustedVisibleQueueCount + adjustedVisibleHistoryCount),
        0
      )
    : 0;
  const hasSidebarActivity = Boolean(active) || queueWithoutActive.length > 0 || history.length > 0;
  const totalQueueFiles = embeddingMeta.totalFiles;
  const completedQueueFiles =
    totalQueueFiles > 0
      ? Math.min(embeddingMeta.completedFiles, totalQueueFiles)
      : embeddingMeta.completedFiles;
  const inFlightFraction =
    active && active.progress < 100 ? Math.max(0, Math.min(1, active.progress / 100)) : 0;
  const totalQueueProgress =
    totalQueueFiles > 0
      ? Math.min(
          100,
          Math.round(((completedQueueFiles + inFlightFraction) / totalQueueFiles) * 100)
        )
      : 0;

  const Wrapper = showFull
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : ({ children }: { children: React.ReactNode }) => (
        <section className="mt-2" aria-labelledby="activity-heading">
          {children}
        </section>
      );

  return (
    <Wrapper>
      {!showFull && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2
            id="activity-heading"
            className="text-sm font-semibold uppercase tracking-wide text-foreground-muted"
          >
            Activity &amp; embedding
          </h2>
          <SyncButton resyncing={resyncing} onSync={handleSyncMouseDown} />
        </div>
      )}

      {!showFull && (
        <p className="mb-4 text-xs leading-relaxed text-foreground-muted">
          {active && active.totalFiles > 0
            ? `Queue progress: ${Math.min(active.completedFiles, active.totalFiles)}/${active.totalFiles} files`
            : resyncing
              ? "Syncing with indexer…"
              : "Files processed for AI embeddings."}
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-500 border border-red-500/20">
          {error}
        </div>
      )}

      <ul className="space-y-4">
        {!showFull && active && (
          <li key={active.id}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <IconFileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {active.name}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
                    role="progressbar"
                    aria-valuenow={active.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Embedding progress for ${active.name}`}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-in-out"
                      style={{ width: `${active.progress}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums font-medium text-primary">
                    {active.progress}%
                  </span>
                </div>
                <p className="mt-1 h-4 truncate text-xs tabular-nums text-foreground-muted">
                  {active.detailText}
                </p>
              </div>
            </div>
          </li>
        )}

        {!showFull && queueWithoutActive.slice(0, adjustedVisibleQueueCount).map((job) => (
          <li key={job.id}>
            <div className="flex items-start gap-3 opacity-90">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground-muted">
                <IconFileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {job.name}
                </p>
                <p className="mt-0.5 text-xs font-medium text-foreground-muted">
                  In queue
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted/80" aria-hidden>
                  <div className="h-full w-0 rounded-full bg-primary/20" />
                </div>
              </div>
            </div>
          </li>
        ))}

        {!showFull &&
          history.slice(0, adjustedVisibleHistoryCount).map((job) => (
            <li key={job.id}>
              <div className="flex items-start gap-3 opacity-45">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground-muted">
                  <IconFileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {job.name}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    Embedded in {job.durationLabel}
                  </p>
                </div>
              </div>
            </li>
          ))}

        {!showFull && !hasSidebarActivity && (
          <li>
            <p className="rounded-xl border border-dashed border-border bg-surface-muted/50 px-4 py-5 text-center text-sm text-foreground-muted">
              No activities yet
            </p>
          </li>
        )}

        {showFull && (
          <li key="embedding-queue-panel">
            <div className="rounded-3xl border border-border bg-surface-elevated p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Embedding queue</p>
                  <p className="text-xs text-foreground-muted">
                    Queue progress: {completedQueueFiles}/{totalQueueFiles || 0} files ({totalQueueProgress}%)
                  </p>
                </div>
                <SyncButton resyncing={resyncing} onSync={handleSyncMouseDown} />
              </div>
              <div
                className="mb-4 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
                aria-valuenow={totalQueueProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Total embedding queue progress"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-in-out"
                  style={{ width: `${totalQueueProgress}%` }}
                />
              </div>
              <div className="grid gap-3">
                {active && (
                  <div className="rounded-2xl border border-border bg-surface-muted p-3">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {active.name}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-surface"
                        role="progressbar"
                        aria-valuenow={active.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Embedding progress for ${active.name}`}
                      >
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-in-out"
                          style={{ width: `${active.progress}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums font-medium text-primary">
                        {active.progress}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-foreground-muted">{active.detailText}</p>
                  </div>
                )}
                {queueWithoutActive.map((job) => (
                  <div
                    key={`full-queue-${job.id}`}
                    className="rounded-2xl border border-border bg-surface-muted p-3"
                  >
                    <p className="text-sm font-semibold text-foreground">{job.name}</p>
                    <p className="mt-1 text-xs text-foreground-muted">In queue</p>
                  </div>
                ))}
                {!active && queueWithoutActive.length === 0 && (
                  <p className="text-sm text-foreground-muted">Queue is empty.</p>
                )}
              </div>
            </div>
          </li>
        )}

        {showFull && (
          <li key="embedding-history-panel">
            <div className="rounded-3xl border border-border bg-surface-elevated p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Embedding history</p>
                  <p className="text-xs text-foreground-muted">History of recently processed items.</p>
                </div>
                <button
                  type="button"
                  onMouseDown={handleClearHistoryMouseDown}
                  onClick={(event) => event.preventDefault()}
                  className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-elevated"
                >
                  Clear history
                </button>
              </div>
              {history.length > 0 ? (
                <div className="grid gap-3">
                  {history.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-2xl border border-border bg-surface-muted p-3"
                    >
                      <p className="text-sm font-semibold text-foreground">{job.name}</p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        Embedded in {job.durationLabel}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">No history yet.</p>
              )}
            </div>
          </li>
        )}
      </ul>
      {!showFull && onViewAll && (
        <div className="mt-4">
          <button
            type="button"
            onMouseDown={handleViewAllMouseDown}
            onClick={(event) => event.preventDefault()}
            className="inline-flex w-full justify-center rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-semibold text-primary hover:bg-surface-elevated"
          >
            {hiddenCount > 0 ? `View all (${hiddenCount} more)` : "View all"}
          </button>
        </div>
      )}
    </Wrapper>
  );
}