import { useEffect, useId, useState } from "react";
import { IconMoon, IconPlus, IconSun, IconTrash } from "./icons";
import { useTheme } from "../context/ThemeContext";

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const DOC_MODELS = [
  "text-embedding-3-large",
  "text-embedding-3-small",
  "nomic-embed",
];
const IMG_MODELS = ["clip-vit-base", "siglip-so400m", "imagebind-hybrid"];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const titleId = useId();
  const { theme, setTheme } = useTheme();
  const [syncInterval, setSyncInterval] = useState(() => {
    const stored = window.localStorage.getItem("shelf-sync-interval");
    return stored ? parseInt(stored, 10) : 1;
  });
  const [topK, setTopK] = useState(5);
  const [chunkingStrategy, setChunkingStrategy] = useState<
    "recursive" | "fixed"
  >("recursive");
  const [chunkSize, setChunkSize] = useState(512);
  const [overlap, setOverlap] = useState(64);
  const [batch, setBatch] = useState(32);
  const [docModel, setDocModel] = useState(DOC_MODELS[0]);
  const [imgModel, setImgModel] = useState(IMG_MODELS[0]);
  const [dirs, setDirs] = useState([]);

  useEffect(() => {
    if (open) {
      fetch("http://localhost:8000/api/directory/paths")
        .then((res) => res.json())
        .then((data) => setDirs(data.dirs || []));
    }
  }, [open]);

  const handleAddDirectory = async (path: string) => {
    await fetch("http://localhost:8000/api/directory/paths", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
    });
    fetch("http://localhost:8000/api/directory/paths")
      .then((res) => res.json())
      .then((data) => setDirs(data.dirs || []));
  };

  const handleRemoveDirectory = async (path: string) => {
    await fetch(`http://localhost:8000/api/directory/paths`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: path }), // Send as JSON body
    });

    fetch("http://localhost:8000/api/directory/paths")
      .then((res) => res.json())
      .then((data) => setDirs(data.dirs || []));
  };

  const clearDatabase = () => {
    const ok = window.confirm(
      "Clear database?\n\nThis will remove your indexed data. Are you sure you want to continue?",
    );
    if (!ok) return;
    // Intentionally a no-op for now; backend wiring will be added later.
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      role="presentation"
    >
      <button
        type="button"
        className={`absolute inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[min(90vh,840px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-card transition-all duration-300 ${
          open ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2 id={titleId} className="text-xl font-medium text-foreground">
              System settings
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Indexing, models, and tracked folders for your smart library.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-foreground-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <fieldset className="mb-8 border-0 p-0">
            <legend className="mb-3 text-sm font-semibold text-foreground">
              Appearance
            </legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition duration-200 ease-material focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  theme === "light"
                    ? "border-primary bg-primary/12 text-primary"
                    : "border-border bg-surface-muted text-foreground hover:bg-primary/5",
                ].join(" ")}
              >
                <IconSun className="h-4 w-4" />
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition duration-200 ease-material focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  theme === "dark"
                    ? "border-primary bg-primary/12 text-primary"
                    : "border-border bg-surface-muted text-foreground hover:bg-primary/5",
                ].join(" ")}
              >
                <IconMoon className="h-4 w-4" />
                Dark
              </button>
            </div>
          </fieldset>

          <div className="space-y-8">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">
                Tracked directories
              </h3>
              <p className="mb-3 text-xs text-foreground-muted">
                Folders continuously scanned for new files to embed.
              </p>
              <ul className="mb-4 divide-y divide-border rounded-xl border border-border bg-surface-muted/50">
                {dirs.map((path) => (
                  <li
                    key={path}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span className="min-w-0 truncate font-mono text-foreground">
                      {path}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-2 text-foreground-muted transition hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Remove ${path}`}
                      onClick={() => {
                        setDirs((d) => d.filter((x) => x !== path));
                        handleRemoveDirectory(path);
                      }}
                    >
                      <IconTrash className="h-5 w-5" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  handleAddDirectory;
                }}
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
              >
                <IconPlus className="h-5 w-5" />
                Add new directory
              </button>
            </div>

            <SliderField
              label="Auto sync interval"
              description="How often to check for new files and sync embeddings, in minutes."
              min={1}
              max={60}
              step={1}
              value={syncInterval}
              onChange={(val) => {
                setSyncInterval(val);
                window.localStorage.setItem("shelf-sync-interval", String(val));
              }}
            />
            <SliderField
              label="Top K"
              description="How many most relevant chunks to retrieve during search."
              min={1}
              max={20}
              step={1}
              value={topK}
              onChange={setTopK}
            />
            <div>
              <label
                htmlFor="chunking-strategy"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Chunking strategy
              </label>
              <p className="mb-2 text-xs text-foreground-muted">
                Choose how the system breaks documents into chunks.
              </p>
              <div className="relative">
                <select
                  id="chunking-strategy"
                  value={chunkingStrategy}
                  onChange={(e) =>
                    setChunkingStrategy(e.target.value as "recursive" | "fixed")
                  }
                  className="h-12 w-full appearance-none rounded-xl border border-border bg-surface-muted pl-4 pr-12 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
                >
                  <option value="recursive">Recursive</option>
                  <option value="fixed">Fixed</option>
                </select>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
            <SliderField
              label="Chunking size"
              description="Target token length per chunk for text indexing."
              min={128}
              max={2048}
              step={64}
              value={chunkSize}
              onChange={setChunkSize}
            />
            <SliderField
              label="Chunk overlap"
              description="Shared tokens between adjacent chunks for continuity."
              min={0}
              max={256}
              step={16}
              value={overlap}
              onChange={setOverlap}
            />
            <SliderField
              label="Batching size"
              description="Files processed per embedding batch."
              min={4}
              max={128}
              step={4}
              value={batch}
              onChange={setBatch}
            />

            <div>
              <label
                htmlFor="doc-model"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Document model
              </label>
              <p className="mb-2 text-xs text-foreground-muted">
                Embedding model for text and documents.
              </p>
              <div className="relative">
                <select
                  id="doc-model"
                  value={docModel}
                  onChange={(e) => setDocModel(e.target.value)}
                  className="h-12 w-full appearance-none rounded-xl border border-border bg-surface-muted pl-4 pr-12 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
                >
                  {DOC_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>

            <div>
              <label
                htmlFor="img-model"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Image model
              </label>
              <p className="mb-2 text-xs text-foreground-muted">
                Vision encoder for images and screenshots.
              </p>
              <div className="relative">
                <select
                  id="img-model"
                  value={imgModel}
                  onChange={(e) => setImgModel(e.target.value)}
                  className="h-12 w-full appearance-none rounded-xl border border-border bg-surface-muted pl-4 pr-12 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
                >
                  {IMG_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface-muted/30 p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Database
              </h3>
              <p className="mb-4 text-xs text-foreground-muted">
                Removes locally stored index data for this app.
              </p>
              <button
                type="button"
                onClick={clearDatabase}
                className="inline-flex w-full items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
              >
                Clear database
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(
                "shelf-sync-interval",
                String(syncInterval),
              );
              onClose();
            }}
            className="rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-on-primary shadow-soft transition hover:bg-primary/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

type SliderFieldProps = {
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
};

function SliderField({
  label,
  description,
  min,
  max,
  step,
  value,
  onChange,
}: SliderFieldProps) {
  const id = useId();
  const numId = `${id}-num`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p
            id={`${id}-legend`}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </p>
          <p className="text-xs text-foreground-muted">{description}</p>
        </div>
        <input
          id={numId}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-labelledby={`${id}-legend`}
          className="w-24 rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-center text-sm tabular-nums text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-labelledby={`${id}-legend`}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-muted accent-primary"
      />
    </div>
  );
}
