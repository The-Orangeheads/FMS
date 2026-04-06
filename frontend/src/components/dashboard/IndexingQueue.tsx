import React from "react";
import {
  HardDrive,
  Loader2,
  FileText,
  CheckCircle,
  XCircle,
  Send,
} from "lucide-react";

export interface QueueItem {
  path: string;
  status: "processing" | "embedding" | "done" | "failed";
  progress?: { current: number; total: number }; // for "embedding x out of y"
}

interface Props {
  queue: QueueItem[];
  isProcessing: boolean;
  onSync: () => void;
}

const statusConfig = {
  processing: {
    icon: <Loader2 size={13} className="animate-spin text-blue-400" />,
    label: "Processing",
    labelClass: "text-blue-400",
    cardClass: "border-slate-700",
  },
  embedding: {
    icon: <Loader2 size={13} className="animate-spin text-yellow-400" />,
    label: "Embedding",
    labelClass: "text-yellow-400",
    cardClass: "border-yellow-500/20",
  },
  done: {
    icon: <CheckCircle size={13} className="text-green-400" />,
    label: "Done",
    labelClass: "text-green-400",
    cardClass: "border-slate-700 opacity-50",
  },
  failed: {
    icon: <XCircle size={13} className="text-red-400" />,
    label: "Failed",
    labelClass: "text-red-400",
    cardClass: "border-red-500/20",
  },
};

const IndexingQueue = ({ queue, isProcessing, onSync }: Props) => {
  const active = queue.filter(
    (q) => q.status === "processing" || q.status === "embedding",
  );
  const finished = queue.filter(
    (q) => q.status === "done" || q.status === "failed",
  );

  return (
    <aside className="relative w-80 bg-[#15202B] border-l border-slate-800 p-6 flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-white font-bold flex items-center gap-2">
          <HardDrive className="text-blue-400" size={18} /> Indexing Queue
        </h3>
        <p className="text-[10px] text-slate-500 uppercase font-bold mt-1 tracking-wider">
          Sync your data
        </p>
      </div>

      {/* Global sync status */}
      {isProcessing && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <div className="flex items-center gap-3 text-blue-400">
            <Loader2 className="animate-spin" size={14} />
            <span className="text-xs font-bold uppercase">
              {active.length} file{active.length !== 1 ? "s" : ""} in progress
            </span>
          </div>
        </div>
      )}

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-slate-600">
            <HardDrive size={28} className="mb-2" />
            <p className="text-xs text-center">
              Queue is empty.
              <br />
              Waiting for backend...
            </p>
          </div>
        ) : (
          <>
            {/* Active items first */}
            {active.map((item, idx) => {
              const cfg = statusConfig[item.status];
              return (
                <div
                  key={idx}
                  className={`p-3 bg-slate-800/60 rounded-lg border ${cfg.cardClass}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {cfg.icon}
                    <span
                      className={`text-[10px] font-bold uppercase ${cfg.labelClass}`}
                    >
                      {item.status === "embedding" && item.progress
                        ? `Embedding ${item.progress.current} / ${item.progress.total}`
                        : cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText size={11} className="text-slate-500 shrink-0" />
                    <span
                      className="text-xs text-slate-300 font-mono truncate"
                      title={item.path}
                    >
                      {item.path.split(/[\\/]/).pop()}
                    </span>
                  </div>

                  {/* Embedding progress bar */}
                  {item.status === "embedding" && item.progress && (
                    <div className="mt-2 h-1 w-full bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 transition-all duration-300"
                        style={{
                          width: `${(item.progress.current / item.progress.total) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Finished items below */}
            {finished.map((item, idx) => {
              const cfg = statusConfig[item.status];
              return (
                <div
                  key={`done-${idx}`}
                  className={`p-3 bg-slate-800/40 rounded-lg border ${cfg.cardClass}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {cfg.icon}
                    <span
                      className={`text-[10px] font-bold uppercase ${cfg.labelClass}`}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText size={11} className="text-slate-500 shrink-0" />
                    <span
                      className="text-xs text-slate-400 font-mono truncate"
                      title={item.path}
                    >
                      {item.path.split(/[\\/]/).pop()}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      <button
        disabled={isProcessing}
        onClick={onSync}
        className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2"
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" size={14} />
        ) : (
          <Send size={14} />
        )}
        {isProcessing ? "SYNCING..." : "SYNC"}
      </button>
    </aside>
  );
};

export default IndexingQueue;
