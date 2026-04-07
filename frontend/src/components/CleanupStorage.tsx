import { useState } from "react";
import { IconFileText } from "./icons";
import { addRecentlyOpened } from "./RecentlyOpened";

type DupFile = {
  id: string;
  name: string;
  path?: string;
  size: string;
  modifiedAt: string;
  selected: boolean;
};

type DupGroup = {
  id: string;
  similarityPct: number;
  files: DupFile[];
};

function parseSize(size: string) {
  const match = size.match(/^([\d.]+)\s*(KB|MB|GB|TB)$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return value * (multipliers[unit] ?? 1);
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes.toFixed(0)} B`;
}

function sortFilesByDate(files: DupFile[]) {
  return [...files].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function withDefaultSelection(files: Omit<DupFile, "selected">[]) {
  const sorted = sortFilesByDate(files as DupFile[]);
  return sorted.map((file, index) => ({ ...file, selected: index > 0 }));
}

const INITIAL_GROUPS: DupGroup[] = [
  {
    id: "g1",
    similarityPct: 96,
    files: withDefaultSelection([
      {
        id: "f1",
        name: "Q3_Report_final.pdf",
        size: "2.1 MB",
        modifiedAt: "2026-04-05T15:12:00Z",
      },
      {
        id: "f2",
        name: "Q3_Report_copy.pdf",
        size: "2.1 MB",
        modifiedAt: "2026-04-05T10:05:00Z",
      },
      {
        id: "f3",
        name: "Q3_Report (1).pdf",
        size: "2.0 MB",
        modifiedAt: "2026-04-04T21:34:00Z",
      },
    ]),
  },
  {
    id: "g2",
    similarityPct: 91,
    files: withDefaultSelection([
      {
        id: "f4",
        name: "logo_mark.svg",
        size: "12 KB",
        modifiedAt: "2026-04-06T08:22:00Z",
      },
      {
        id: "f5",
        name: "logo_mark_export.svg",
        size: "12 KB",
        modifiedAt: "2026-04-04T19:18:00Z",
      },
    ]),
  },
  {
    id: "g3",
    similarityPct: 87,
    files: withDefaultSelection([
      {
        id: "f6",
        name: "notes_backup.md",
        size: "48 KB",
        modifiedAt: "2026-04-05T13:54:00Z",
      },
      {
        id: "f7",
        name: "notes.md",
        size: "44 KB",
        modifiedAt: "2026-04-03T11:40:00Z",
      },
    ]),
  },
];

export function CleanupStorage() {
  const [groups, setGroups] = useState(INITIAL_GROUPS);

  const updateSelection = (
    groupId: string,
    fileId: string,
    selected: boolean,
  ) => {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          files: group.files.map((file) =>
            file.id !== fileId ? file : { ...file, selected },
          ),
        };
      }),
    );
  };

  const deleteSelected = (groupId: string) => {
    setGroups((prev) =>
      prev
        .map((group) => {
          if (group.id !== groupId) return group;
          const remaining = group.files.filter((file) => !file.selected);
          return {
            ...group,
            files: remaining,
          };
        })
        .filter((group) => group.files.length > 1),
    );
  };

  const openFile = (file: DupFile) => {
    const electron = (window as any).require
      ? (window as any).require("electron")
      : null;
    if (!electron?.ipcRenderer) return;
    const targetPath = file.path || file.name;
    electron.ipcRenderer
      .invoke("open-file-in-os", targetPath)
      .then(() => addRecentlyOpened(targetPath))
      .catch((err: unknown) => console.error("Failed to open file:", err));
  };

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-foreground-muted text-center">
        Near-duplicate files detected by content similarity. Delete extras to
        free space; keep at least one file per group.
      </p>
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-muted/50 px-4 py-8 text-center text-sm text-foreground-muted">
          No duplicate groups found. Run a scan from the desktop agent to
          refresh.
        </p>
      ) : (
        <ul className="space-y-4">
          {groups.map((group) => {
            const totalBytes = group.files.reduce(
              (sum, file) => sum + parseSize(file.size),
              0,
            );
            const selectedBytes = group.files
              .filter((file) => file.selected)
              .reduce((sum, file) => sum + parseSize(file.size), 0);
            const selectedCount = group.files.filter(
              (file) => file.selected,
            ).length;

            return (
              <li
                key={group.id}
                className="rounded-xl border border-border bg-surface-muted/40 p-4 shadow-soft"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Near duplicate group
                    </p>
                    <p className="text-xs text-foreground-muted">
                      Group storage: {formatBytes(totalBytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={selectedCount === 0}
                      onClick={() => deleteSelected(group.id)}
                      className="inline-flex items-center rounded-full border border-red-400 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete selected
                    </button>
                    <p className="text-xs text-foreground-muted">
                      {selectedCount} selected · {formatBytes(selectedBytes)}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                    {group.similarityPct}% similar
                  </span>
                </div>
                <ul className="space-y-2">
                  {sortFilesByDate(group.files).map((file) => (
                    <li
                      key={file.id}
                      className={`rounded-2xl border border-border/80 ${
                        file.selected
                          ? "bg-primary/5 border-primary/20"
                          : "bg-surface-elevated"
                      }`}
                    >
                      <div className="flex items-center gap-3 px-3 py-2">
                        <label className="flex items-center gap-3 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={file.selected}
                            onChange={(event) =>
                              updateSelection(
                                group.id,
                                file.id,
                                event.target.checked,
                              )
                            }
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-primary">
                              <IconFileText className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {file.name}
                              </p>
                              <p className="flex flex-wrap gap-2 text-xs text-foreground-muted">
                                <span>{file.size}</span>
                                <span>•</span>
                                <span>
                                  {new Date(file.modifiedAt).toLocaleDateString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    },
                                  )}
                                </span>
                              </p>
                            </div>
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => openFile(file)}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition hover:border-primary hover:text-primary"
                        >
                          Open
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
