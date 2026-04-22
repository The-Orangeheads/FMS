import { useEffect, useState } from "react";
import { getCachedThumbnail, setCachedThumbnail } from "../libs/thumbnailCache";
import { addRecentlyOpened } from "./RecentlyOpened";
import { getPdfPreview } from "../libs/pdfPreview";
import { IconFileText, IconFileImage } from "./icons";
import toast from "react-hot-toast";

export type ResultRow = {
  name: string;
  match: number;
  path: string;
  type: "image" | "text";
  bestPage?: number;
  fileSize?: string;
  modifiedDate?: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function formatDate(nanoseconds: number): string {
  const milliseconds = Math.floor(nanoseconds / 1000000);
  const date = new Date(milliseconds);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday =
    date.toDateString() === today.toDateString();
  const isYesterday =
    date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } else if (isYesterday) {
    return "Yesterday";
  } else if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  }
}

type SearchResultsProps = {
  query: string;
  results?: any[];
  isLoading?: boolean;
  isReranking?: boolean;
  animationKey?: number;
};

function ResultThumb({ path, type }: { path: string; type: "image" | "text" }) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const loadThumb = async () => {
      if (!path) return;

      // 1. Check cache first!
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
            await setCachedThumbnail(path, dataUrl); // Save to cache
            return;
          }
        }
      } catch (error) {
        // OS thumbnail failed, move to fallback
      }

      // 2. Fallback for PDFs
      if (path.toLowerCase().endsWith(".pdf") && isMounted) {
        const pdfThumb = await getPdfPreview(path);
        if (pdfThumb && isMounted) {
          setPreview(pdfThumb);
          await setCachedThumbnail(path, pdfThumb); // Save to cache
        }
      }
    };

    loadThumb();

    return () => { 
      isMounted = false; 
    };
  }, [path]);

  // 1. Image preview if available
  if (preview) {
    return (
      <span className="flex h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted">
        <img 
          src={preview} 
          alt="" 
          className="h-full w-full object-cover" 
        />
      </span>
    );
  }

  // 2. Minimal clean fallback UI
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-foreground-muted opacity-40">
      {type === "text" ? (
        <IconFileText className="h-6 w-6" />
      ) : (
        <IconFileImage className="h-6 w-6" />
      )}
    </span>
  );
}

export function SearchResults({
  query,
  results,
  isLoading = false,
  isReranking = false,
  animationKey = 0,
}: SearchResultsProps) {
  const [showRerankingBadge, setShowRerankingBadge] = useState(false);
  const q = query.trim();
  const isImagePathQuery =
    (q.includes("\\") || q.includes("/")) &&
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(q);
  const queryLabel = isImagePathQuery
    ? q.split(/[/\\]/).filter(Boolean).pop() || q
    : q;

  useEffect(() => {
    if (!isReranking) {
      setShowRerankingBadge(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowRerankingBadge(true);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [isReranking]);

  if (isLoading) {
    return (
      <div aria-labelledby="results-heading">
        <h2
          id="results-heading"
          className="mb-4 text-center text-3xl font-bold text-foreground"
        >
          Search results
        </h2>
        <p className="mb-4 text-sm text-foreground-muted">
          Fetching matches for{" "}
          <span className="font-medium text-foreground">&ldquo;{queryLabel}&rdquo;</span>
          …
        </p>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface-elevated px-4 py-3 shadow-soft animate-pulse"
            >
              <span className="h-14 w-14 rounded-lg bg-surface-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="block h-4 w-3/4 rounded-xl bg-surface-muted" />
                <span className="block h-3 w-1/2 rounded-xl bg-surface-muted" />
              </div>
              <span className="h-8 w-16 rounded-full bg-surface-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const regex = /[^\\/]+$/;
  const transformedResults = results
    ? results.map((result: any) => {
        let row = {} as ResultRow;
        row.name = result.metadata.path.match(regex)?.[0];
        row.match = result.score ? Math.round(result.score * 100) : 0;
        row.path = result.metadata.path;
        row.type = result.type;
        row.bestPage = result.metadata?.page_number;
        row.fileSize = result.metadata?.fsize
          ? formatFileSize(result.metadata.fsize)
          : undefined;
        row.modifiedDate = result.metadata?.mdate
          ? formatDate(result.metadata.mdate)
          : undefined;
        return row;
      })
    : [];

  return (
    <div aria-labelledby="results-heading">
      <h2
        id="results-heading"
        className="mb-4 text-center text-3xl font-bold text-foreground"
      >
        Search results
      </h2>
      {q ? (
        <p className="mb-4 text-sm text-foreground-muted">
          Showing matches for{" "}
          <span className="font-medium text-foreground">&ldquo;{queryLabel}&rdquo;</span>
        </p>
      ) : (
        <p className="mb-4 text-sm text-foreground-muted">
          Showing semantic matches.
        </p>
      )}
      {showRerankingBadge ? (
        <div className="mb-3 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Refining results...
        </div>
      ) : null}

      {transformedResults.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted/30 py-16 text-center">
          <h3 className="mb-2 text-lg font-bold text-foreground">No matches found</h3>
          <p className="max-w-sm text-sm text-foreground-muted">
            Couldn't find any files matching <span className="font-medium text-foreground">&ldquo;{queryLabel}&rdquo;</span>. Try adjusting your search term.
          </p>
        </div>
      ) : (
        <ul
          key={animationKey}
          className={[
            "flex flex-col gap-3 transition-opacity duration-300",
            isReranking ? "opacity-50" : "opacity-100",
            !isReranking ? "animate-results-refresh" : "",
          ].join(" ")}
        >
          {transformedResults.map((r) => (
            <li key={`${r.path}-${r.name}`}>
              <button
                type="button"
                onDoubleClick={async () => {
                if (!window.electron?.ipcRenderer) return;
                try {
                  const res = await window.electron.ipcRenderer.invoke("open-file-in-os", r.path);
                  if (!res?.ok) {
                    toast.error("Could not open file. It may have been moved or deleted.");
                    return;
                  }
                  addRecentlyOpened(r.path);
                } catch (error) {
                  toast.error("Failed to communicate with the operating system.");
                }
              }}
                className={[
                  "flex w-full items-center gap-4 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-left shadow-soft transition-all duration-300 ease-material focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]",
                  isReranking ? "animate-pulse" : "hover:shadow-card",
                ].join(" ")}
              >
              <ResultThumb path={r.path} type={r.type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {r.name}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    {r.type === "text" && r.bestPage != null ? (
                      <>Page {r.bestPage}</>
                    ) : null} 
                    {r.type === "text" && r.bestPage != null && (r.fileSize || r.modifiedDate) ? (
                      <> · </>
                    ) : null}
                    {r.fileSize ? (
                      <>{r.fileSize}</>
                    ) : null}
                    {r.fileSize && r.modifiedDate ? (
                      <> · </>
                    ) : null}
                    {r.modifiedDate ? (
                      <>{r.modifiedDate}</>
                    ) : null}
                    {!r.fileSize && !r.modifiedDate ? (
                      <>Semantic match</>
                    ) : null}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center rounded-full bg-primary/12 px-3 py-1.5 text-sm font-semibold tabular-nums text-primary">
                  {r.match}% match
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}