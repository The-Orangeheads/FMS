import { IconFileImage, IconFileText } from "./icons";
import { addRecentlyOpened } from "./RecentlyOpened";

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
};

export function SearchResults({
  query,
  results,
  isLoading = false,
}: SearchResultsProps) {
  const electron = (window as any).require
    ? (window as any).require("electron")
    : null;
  const q = query.trim();
  const isImagePathQuery =
    (q.includes("\\") || q.includes("/")) &&
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(q);
  const queryLabel = isImagePathQuery
    ? q.split(/[/\\]/).filter(Boolean).pop() || q
    : q;

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
      <ul className="flex flex-col gap-3">
        {transformedResults.map((r) => (
          <li key={r.name}>
            <button
              type="button"
              onDoubleClick={async () => {
                if (!electron?.ipcRenderer || !r.path) return;
                try {
                  await electron.ipcRenderer.invoke("open-file-in-os", r.path);
                  addRecentlyOpened(r.path);
                } catch (error) {
                  console.error("Failed to open file:", error);
                }
              }}
              className="flex w-full items-center gap-4 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-left shadow-soft transition-all duration-300 ease-material hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                {r.type === "text" ? (
                  <span className="relative flex h-11 w-9 flex-col rounded border border-foreground/10 bg-surface-elevated">
                    <span className="mx-1 mt-1 h-1 w-4 rounded-sm bg-foreground/15" />
                    <span className="mx-1 mt-0.5 h-px w-full bg-foreground/10" />
                    <IconFileText className="m-auto h-7 w-7 text-primary" />
                  </span>
                ) : (
                  <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border border-primary/20 bg-gradient-to-br from-primary/20 to-emerald-400/10">
                    <IconFileImage className="h-8 w-8 text-primary/90" />
                  </span>
                )}
              </span>
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
    </div>
  );
}
