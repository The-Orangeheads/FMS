import { useCallback, useEffect, useRef, useState } from "react";
import { IconFileText, IconRefresh } from "./icons";
import { useSyncInterval } from "../context/ThemeContext";

type Completed = { id: string; name: string; durationLabel: string };
type Queued = { id: string; name: string };
type ActivePhase = "preprocessing" | "embedding";

type Active = {
  id: string;
  name: string;
  phase: ActivePhase;
  progress: number;
};

// Fixed: added queue to START_SYNC, added SYNC_COMPLETE
type BackendMessage =
  | { type: "START_SYNC"; total: number; queue: Queued[] }
  | { type: "SYNC_PROGRESS"; current_file: string; progress: number; remaining: number }
  | { type: "FILE_STATUS"; message: string }
  | { type: "SYNC_ERROR"; file: string; error: string }
  | { type: "SYNC_COMPLETE" };

export function ActivityEmbedding({
  onViewAll,
  showFull,
}: {
  onViewAll?: () => void;
  showFull?: boolean;
}) {
  const [active, setActive] = useState<Active | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [history, setHistory] = useState<Completed[]>(() => {
    const stored = window.localStorage.getItem("shelf-embedding-history");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [resyncing, setResyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncInterval = useSyncInterval();
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;

    const connect = () => {
      if (socket && socket.readyState === WebSocket.OPEN) return;

      socket = new WebSocket("ws://localhost:8000/ws");

      socket.onopen = () => {
        console.log("WebSocket connected");
        reconnectAttempts = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data: BackendMessage = JSON.parse(event.data);

          switch (data.type) {
            case "START_SYNC":
              // Fixed: use real queue from backend, not SNAPSHOT
              setError(null);
              setResyncing(false);
              setQueue(data.queue);
              setActive(null);
              break;

            case "FILE_STATUS":
              setActive({
                id: "active-job",
                name: data.message.split(": ").pop() || "Processing...",
                phase: "preprocessing",
                progress: 0,
              });
              break;

            case "SYNC_PROGRESS":
              setActive({
                id: "active-job",
                name: data.current_file,
                phase: "embedding",
                progress: data.progress,
              });

              setQueue((prev) =>
                prev.filter((item) => item.name !== data.current_file)
              );

              if (data.progress === 100) {
                const newEntry: Completed = {
                  id: Date.now().toString(),
                  name: data.current_file,
                  durationLabel: "Just now",
                };
                setHistory((prev) => {
                  const updated = [newEntry, ...prev].slice(0, 50);
                  window.localStorage.setItem(
                    "shelf-embedding-history",
                    JSON.stringify(updated)
                  );
                  return updated;
                });
              }
              break;

            // Fixed: handle SYNC_COMPLETE to clear active state
            case "SYNC_COMPLETE":
              setActive(null);
              setResyncing(false);
              setQueue([]);
              break;

            case "SYNC_ERROR":
              setError(`Error processing ${data.file}: ${data.error}`);
              setResyncing(false);
              break;
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      socket.onclose = (event) => {
        console.log("WebSocket closed", event.code, event.reason);
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(2000 * reconnectAttempts, 15000);
          reconnectTimeout = setTimeout(() => {
            console.log(`Reconnecting (${reconnectAttempts}/${maxReconnectAttempts})...`);
            connect();
          }, delay);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }, []);

  const handleSync = useCallback(async () => {
    setResyncing(true);
    setError(null);
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
    }
  }, []);

  useEffect(() => {
    if (syncTimer.current) clearInterval(syncTimer.current);
    syncTimer.current = window.setInterval(() => {
      handleSync();
    }, syncInterval * 60000);
    return () => {
      if (syncTimer.current) clearInterval(syncTimer.current);
    };
  }, [syncInterval, handleSync]);

  const queuePreview = queue.slice(0, 3);
  const hasMoreQueue = queue.length > queuePreview.length;
  const hiddenQueue = queue.slice(3);

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
          <button
            type="button"
            onClick={handleSync}
            disabled={resyncing}
            title="Resync embedding queue"
            aria-label="Resync embedding files"
            className="rounded-full p-2 text-foreground-muted transition hover:bg-surface-muted hover:text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconRefresh className={`h-4 w-4 ${resyncing ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}

      {!showFull && (
        <p className="mb-4 text-xs leading-relaxed text-foreground-muted">
          {resyncing ? "Syncing with indexer…" : "Files processed for AI embeddings."}
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-500 border border-red-500/20">
          {error}
        </div>
      )}

      <ul className="space-y-4">
        {active && (
          <li>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <IconFileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {active.name}
                </p>
                <p className="mt-0.5 text-xs font-medium text-primary">
                  {active.phase === "preprocessing"
                    ? "Preprocessing…"
                    : `Embedding ${active.progress}%`}
                </p>
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
                  role="progressbar"
                  aria-valuenow={active.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-in-out"
                    style={{ width: `${active.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs tabular-nums text-foreground-muted">
                  {active.phase === "preprocessing"
                    ? "Preparing file…"
                    : `${active.progress}% complete`}
                </p>
              </div>
            </div>
          </li>
        )}

        {(showFull ? queue : queuePreview).map((job) => (
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

        {hasMoreQueue && !showFull && onViewAll && (
          <li>
            <button
              type="button"
              onClick={onViewAll}
              className="inline-flex w-full justify-center rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-semibold text-primary transition hover:bg-surface-elevated"
            >
              View all ({hiddenQueue.length} more)
            </button>
          </li>
        )}

        {!showFull && history.length > 0 && (
          <>
            {history.slice(0, 2).map((job) => (
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
          </>
        )}

        {showFull && (
          <li>
            <div className="rounded-3xl border border-border bg-surface-elevated p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Embedding history</p>
                  <p className="text-xs text-foreground-muted">Saved locally in your browser.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHistory([]);
                    window.localStorage.removeItem("shelf-embedding-history");
                  }}
                  className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-elevated"
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
    </Wrapper>
  );
}