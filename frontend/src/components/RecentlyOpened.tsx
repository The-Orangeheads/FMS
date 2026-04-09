import { useEffect, useState } from "react";
import { IconFileText } from "./icons";

type RecentEntry = {
  name: string;
  path: string;
  type: "pdf" | "image";
};

const RECENTS_KEY = "shelf-recently-opened";
const RECENTS_UPDATED_EVENT = "shelf-recently-opened-updated";
const RECENTS_LIMIT = 12;

function getFileName(path: string) {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

function getFileType(path: string): "pdf" | "image" {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path) ? "image" : "pdf";
}

function readRecents(): RecentEntry[] {
  const raw = window.localStorage.getItem(RECENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, RECENTS_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeRecents(entries: RecentEntry[]) {
  const capped = entries.slice(0, RECENTS_LIMIT);
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(capped));
  window.dispatchEvent(new CustomEvent(RECENTS_UPDATED_EVENT, { detail: capped }));
}

export function addRecentlyOpened(path: string) {
  if (!path) return;
  const nextEntry: RecentEntry = {
    name: getFileName(path),
    path,
    type: getFileType(path),
  };
  const existing = readRecents().filter((item) => item.path !== path);
  writeRecents([nextEntry, ...existing]);
}

export function removeRecentlyOpened(path: string) {
  if (!path) return;
  const next = readRecents().filter((item) => item.path !== path);
  writeRecents(next);
}

function FileThumb({ type }: { type: "pdf" | "image" }) {
  if (type === "pdf") {
    return (
      <div
        className="flex h-full w-full flex-col rounded-md border border-border bg-surface-muted p-1.5"
        aria-hidden
      >
        <div className="mb-1 h-1 w-2/3 rounded-sm bg-foreground/15" />
        <div className="mb-0.5 h-0.5 w-full rounded-sm bg-foreground/10" />
        <div className="mb-0.5 h-0.5 w-5/6 rounded-sm bg-foreground/10" />
        <div className="mt-auto flex justify-center">
          <IconFileText className="h-8 w-8 text-primary/80" />
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-md border border-border bg-gradient-to-br from-primary/15 to-emerald-400/10"
      aria-hidden
    >
      <svg width="40" height="40" viewBox="0 0 64 64" fill="none" aria-hidden>
        <rect x="8" y="12" width="48" height="40" rx="4" className="stroke-primary/40" strokeWidth="2" />
        <circle cx="24" cy="28" r="4" fill="var(--color-primary)" fillOpacity="0.5" />
        <path d="M12 44 L28 30 L40 38 L52 26 V52 H12 Z" className="fill-primary/25" />
      </svg>
    </div>
  );
}

export function RecentlyOpened({
  showViewAll = true,
  onViewAll,
  hideHeader = false,
  maxItems,
}: {
  showViewAll?: boolean;
  onViewAll?: () => void;
  hideHeader?: boolean;
  maxItems?: number;
}) {
  const [files, setFiles] = useState<RecentEntry[]>(() => readRecents());
  const electron = (window as any).require
    ? (window as any).require("electron")
    : null;

  useEffect(() => {
    const onRecentsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<RecentEntry[]>;
      setFiles(customEvent.detail || []);
    };
    window.addEventListener(RECENTS_UPDATED_EVENT, onRecentsUpdated as EventListener);
    return () => {
      window.removeEventListener(RECENTS_UPDATED_EVENT, onRecentsUpdated as EventListener);
    };
  }, []);

  const visibleFiles =
    typeof maxItems === "number" ? files.slice(0, Math.max(maxItems, 0)) : files;

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2
            id="recent-heading"
            className="flex-1 text-center text-3xl font-bold text-foreground"
          >
            Recently opened
          </h2>
          {showViewAll && onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-medium text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              View all
            </button>
          ) : null}
          {!onViewAll ? (
            <button
              type="button"
              onClick={() => writeRecents([])}
              className="text-sm font-medium text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Clear history
            </button>
          ) : null}
        </div>
      )}
      {files.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-muted/50 px-4 py-8 text-center text-sm text-foreground-muted">
          No recently opened files
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {visibleFiles.map((f) => (
            <li key={f.path}>
            <button
              type="button"
              onDoubleClick={async () => {
                if (!electron?.ipcRenderer) return;
                try {
                  const result = await electron.ipcRenderer.invoke("open-file-in-os", f.path);
                  if (!result?.ok) {
                    removeRecentlyOpened(f.path);
                    return;
                  }
                  addRecentlyOpened(f.path);
                } catch (error) {
                  removeRecentlyOpened(f.path);
                  console.error("Failed to open file:", error);
                }
              }}
              className="group flex w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated text-left shadow-soft transition-all duration-300 ease-material hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <div className="aspect-[4/3] w-full overflow-hidden border-b border-border bg-surface-muted p-2">
                <FileThumb type={f.type} />
              </div>
              <div className="px-3 py-2.5">
                <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                <p className="text-xs uppercase tracking-wide text-foreground-muted">
                  {f.type === "pdf" ? "Document" : "Image"}
                </p>
              </div>
            </button>
          </li>
          ))}
        </ul>
      )}
    </div>
  );
}
