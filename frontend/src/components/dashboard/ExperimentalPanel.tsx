import React from "react";
import type { BackendModelConfig } from "../../types";

interface Props {
  strategy: string;
  model: string;
  db: string;
  topK: number;
  availableModels: BackendModelConfig[];
  availableStrategies: string[];
  onUpdate: (key: string, value: string | number) => void;
  onClearDb: () => void;
  isClearing: boolean;
}

const ExperimentalPanel: React.FC<Props> = ({
  strategy,
  model,
  db,
  topK,
  availableModels = [],
  availableStrategies = [],
  onUpdate,
  onClearDb,
  isClearing,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-6 bg-[#161F27]/50 border border-slate-800 rounded-xl backdrop-blur-sm">
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Embedding Model
        </label>
        <select
          value={model}
          onChange={(e) => onUpdate("model", e.target.value)}
          className="bg-[#0B141A] border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 outline-none"
        >
          <option value="auto">Auto-Detect</option>
          {availableModels.map((m) => (
            <option key={m.key} value={m.key}>
              {m.key.toUpperCase()} —{" "}
              {m.languages.includes("multi")
                ? "Multilingual"
                : m.languages.join(", ")}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Strategy
        </label>
        <select
          value={strategy}
          onChange={(e) => onUpdate("strategy", e.target.value)}
          className="bg-[#0B141A] border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200"
        >
          {availableStrategies.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex justify-between">
          <span>Top K</span>
          <span className="text-blue-400 font-mono">{topK}</span>
        </label>
        <input
          type="range"
          min="1"
          max="20"
          value={topK}
          onChange={(e) => onUpdate("topK", parseInt(e.target.value))}
          className="h-1.5 w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2"
        />
      </div>

      <div className="flex flex-col gap-2 justify-end">
        <button
          type="button"
          onClick={onClearDb}
          disabled={isClearing}
          className="px-4 py-2.5 text-sm font-bold bg-red-900/50 hover:bg-red-800/60 border border-red-700/50 rounded-lg text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isClearing ? "Clearing..." : "Clear Database"}
        </button>
      </div>
    </div>
  );
};

export default ExperimentalPanel;
