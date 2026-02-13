import { useState } from "react";

import { Search } from "lucide-react";
import ExperimentalPanel from "../dashboard/ExperimentalPanel";
import QuerySection from "../dashboard/QuerySection";
import type { ChunkingStrategy, EmbeddingModel, VectorDB } from "../../types";

interface Props {
  activeTab: string;
  isProcessing: boolean;
}

const ContentBody = ({ activeTab, isProcessing }: Props) => {
  const [labConfig, setLabConfig] = useState({
    strategy: "Recursive" as ChunkingStrategy,
    model: "Text-v2-Small" as EmbeddingModel,
    db: "Pinecone" as VectorDB,
  });

  const handleLabUpdate = (key: string, value: string) => {
    setLabConfig((prev) => ({ ...prev, [key]: value }));
  };
  return (
    <main className="flex-1 flex flex-col overflow-y-auto">
      <header className="p-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {activeTab}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === "Developer Lab"
              ? "Configure RAG parameters & test performance"
              : "Manage and query your library"}
          </p>
        </div>
        <div className="relative w-96">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            size={16}
          />
          <input
            type="text"
            placeholder="Search documents..."
            className="w-full bg-[#1C2732] border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-all"
          />
        </div>
      </header>

      <div className="px-8 pb-10">
        {activeTab === "Developer Lab" ? (
          /* EXPERIMENTAL VIEW */
          <div className="animate-in fade-in duration-500">
            <ExperimentalPanel
              strategy={labConfig.strategy}
              model={labConfig.model}
              db={labConfig.db}
              onUpdate={handleLabUpdate}
              onClearDb={() => alert("Vector Database Cleared")}
            />
            <div className="mt-8">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 px-1">
                Testing Playground
              </h3>
              <QuerySection isProcessing={isProcessing} maxChars={500} />
            </div>
          </div>
        ) : (
          /* STANDARD VIEW */
          <div className="animate-in fade-in duration-500">
            <QuerySection isProcessing={isProcessing} maxChars={500} />
            {/* Add your StatCards and Recent Files components here */}
            <div className="p-20 border border-dashed border-slate-800 rounded-xl text-center text-slate-600">
              Dashboard Stats & Files Table Component
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default ContentBody;
