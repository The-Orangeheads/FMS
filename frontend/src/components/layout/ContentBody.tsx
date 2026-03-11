import React, { useState, useMemo, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";

import ExperimentalPanel from "../dashboard/ExperimentalPanel";
import QuerySection from "../dashboard/QuerySection";

import { useRagQuery } from "../../hooks/useRagQuery";
import { useVectorDb } from "../../hooks/useVectorDB";
import { useConfig } from "../../hooks/useConfig";
import type { ChunkingStrategy, EmbeddingModel, VectorDB } from "../../types";

interface Props {
  activeTab: string;
  isProcessing: boolean;
}

const ContentBody: React.FC<Props> = ({ activeTab, isProcessing }) => {
  const config = useConfig(); // Async hook

  const [labConfig, setLabConfig] = useState({
    model: "auto",
    strategy: "recursive",
    db: "Chroma",
    topK: 5,
  });

  const {
    runQuery,
    loading: isQuerying,
    data: queryResults,
    error: queryError,
  } = useRagQuery();

  const { handleClear, isClearing } = useVectorDb();

  const handleLabUpdate = (key: string, value: string | number) => {
    setLabConfig((prev) => ({ ...prev, [key]: value }));
  };

  const onRunQuery = useCallback(
    (text: string) => {
      runQuery(text, "unified", {
        model_name: "auto",
        k: labConfig.topK,
      });
    },
    [runQuery, labConfig.topK],
  );
  const mappedResults = useMemo(() => {
    return (queryResults?.results ?? []).map((res: any) => ({
      text: res.metadata?.text ?? res.text ?? "Visual Match",
      score: res.score ?? 0,
      sourceFile: res.sourceFile ?? res.metadata?.filename ?? "Unknown Source",
      type: (res.type ?? res.metadata?.type) === "image" ? "image" : "text",
      imagePath: res.imagePath ?? null, // null = legacy image, no persisted file
    }));
  }, [queryResults]);

  const querySectionProps = {
    isProcessing,
    isQuerying,
    maxChars: 500,
    onRunQuery,
    results: mappedResults,
    error: queryError,
  };

  const isLab = activeTab === "Developer Lab";

  return (
    <main className="flex-1 flex flex-col overflow-y-auto bg-[#0B111A]">
      <header className="p-8 flex items-center justify-between border-b border-slate-800/50">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {activeTab}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isLab
              ? "Configure RAG parameters & test performance"
              : "Manage and query your library"}
          </p>
        </div>
      </header>

      <div className="px-8 pb-10 pt-6 animate-in fade-in duration-500">
        {isLab ? (
          config ? (
            <div className="space-y-8">
              <ExperimentalPanel
                {...labConfig}
                availableModels={config.models}
                availableStrategies={config.strategies}
                onUpdate={handleLabUpdate}
                onClearDb={() => handleClear(labConfig.db as VectorDB)}
                isClearing={isClearing}
              />
              <section className="space-y-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-1">
                  Testing Playground
                </h3>
                <QuerySection {...querySectionProps} />
              </section>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-800 rounded-xl">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
              <p className="text-slate-400 text-sm italic">
                Synchronizing with Backend Registry...
              </p>
            </div>
          )
        ) : (
          <div className="space-y-8">
            <QuerySection {...querySectionProps} />
            <div className="mt-4 p-20 border border-dashed border-slate-800 rounded-xl text-center text-slate-600 text-sm">
              Storage Statistics & Files Table Component
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default ContentBody;
