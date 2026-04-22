import { useEffect, useState } from "react";
import { getCachedThumbnail, setCachedThumbnail } from "../libs/thumbnailCache";
import { getPdfPreview } from "../libs/pdfPreview";
import { IconFileText, IconFileImage } from "./icons";
import toast from "react-hot-toast";

type RecentEntry = {
  name: string;
  path: string;
  type: "pdf" | "image";
};

const RECENTS_KEY = "shelf-recently-opened";
const RECENTS_UPDATED_EVENT = "shelf-recently-opened-updated";
const RECENTS_LIMIT = 16;

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

function FileThumb({ file }: { file: RecentEntry }) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const loadThumb = async () => {
      // 1. Check cache first!
      const cached = await getCachedThumbnail(file.path);
      if (cached && isMounted) {
        setPreview(cached);
        return;
      }

    try {
        if (window.electron?.ipcRenderer) {
          // Strictly use file.path here!
          const dataUrl = await window.electron.ipcRenderer.invoke('get-file-thumbnail', file.path);
          if (dataUrl && isMounted) {
            setPreview(dataUrl);
            await setCachedThumbnail(file.path, dataUrl);
            return;
          }
        }
      } catch (error) {
        // Fallback
      }

      if (file.type === "pdf" && isMounted) {
        const pdfThumb = await getPdfPreview(file.path);
        if (pdfThumb && isMounted) {
          setPreview(pdfThumb);
          await setCachedThumbnail(file.path, pdfThumb); // Save to cache
        }
      }
    };

    loadThumb();

    return () => { 
      isMounted = false; 
    };
  }, [file.path]);

  // 1. Image preview if available
  if (preview) {
    return (
      <img 
        src={preview} 
        alt={`Preview of ${file.name}`} 
        className="h-full w-full object-cover" 
      />
    );
  }

  // 2. Minimal clean fallback for Documents (PDFs/Text)
  if (file.type === "pdf") {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-md bg-surface-muted text-foreground-muted opacity-40" aria-label="Document thumbnail">
        <IconFileText className="h-10 w-10" />
      </div>
    );
  }

  // 3. Minimal clean fallback for Images
  return (
    <div className="flex h-full w-full items-center justify-center rounded-md bg-surface-muted text-foreground-muted opacity-40" aria-label="Image thumbnail">
      <IconFileImage className="h-10 w-10" />
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
        <div className="relative mb-8 text-center">
          <h2
            id="recent-heading"
            className="text-3xl font-bold text-foreground"
          >
            Recently opened
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Quickly jump back into your recently viewed files.
          </p>
          {showViewAll && onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="absolute right-0 top-2 text-sm font-bold text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              View all
            </button>
          ) : null}
          {!onViewAll ? (
            <button
              type="button"
              onClick={() => writeRecents([])}
              className="absolute right-0 top-2 text-sm font-bold text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                if (!window.electron?.ipcRenderer) return;
                try {
                  const result = await window.electron.ipcRenderer.invoke("open-file-in-os", f.path);
                  if (!result?.ok) {
                    removeRecentlyOpened(f.path);
                    toast.error("File not found. It has been removed from history.");
                    return;
                  }
                  addRecentlyOpened(f.path);
                } catch (error) {
                  removeRecentlyOpened(f.path);
                  toast.error("Failed to communicate with the operating system.");
                }
              }}
              className="group flex w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated text-left shadow-soft transition-all duration-300 ease-material hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <div className="aspect-[4/3] w-full overflow-hidden border-b border-border bg-surface-muted">
                <FileThumb file={f} />
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
