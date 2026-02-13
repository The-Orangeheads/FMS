import React from "react";
import { Beaker, Trash2 } from "lucide-react";
import type {
  ChunkingStrategy,
  EmbeddingModel,
  VectorDB,
} from "../../types/index";

interface Props {
  strategy: ChunkingStrategy;
  model: EmbeddingModel;
  db: VectorDB;
  onUpdate: (key: string, value: string) => void;
  onClearDb: () => void;
}

const ExperimentalPanel: React.FC<Props> = ({
  strategy,
  model,
  db,
  onUpdate,
  onClearDb,
}) => {
  return (
    <section className="bg-blue-600/5 border border-blue-500/20 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4 text-blue-400">
        <Beaker size={18} />
        <h3 className="text-xs font-bold uppercase tracking-widest">
          Experimental Developer Lab
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 uppercase font-bold px-1">
            Chunking Strategy
          </label>
          <select
            value={strategy}
            onChange={(e) => onUpdate("strategy", e.target.value)}
            className="w-full bg-[#1C2732] border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
          >
            <option value="Recursive">Recursive</option>
            <option value="Semantic">Semantic</option>
            <option value="Character-based">Character-based</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 uppercase font-bold px-1">
            Embedding Model
          </label>
          <select
            value={model}
            onChange={(e) => onUpdate("model", e.target.value)}
            className="w-full bg-[#1C2732] border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
          >
            <option value="Text-v2-Small">Text-v2-Small</option>
            <option value="Text-v3-Large">Text-v3-Large</option>
            <option value="Clip-v2 (Images)">Clip-v2 (Images)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 uppercase font-bold px-1">
            Vector Database
          </label>
          <select
            value={db}
            onChange={(e) => onUpdate("db", e.target.value)}
            className="w-full bg-[#1C2732] border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
          >
            <option value="Pinecone">Pinecone</option>
            <option value="Milvus">Milvus</option>
            <option value="Weaviate">Weaviate</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={onClearDb}
            className="flex items-center justify-center gap-2 w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg p-2 text-sm transition-all"
          >
            <Trash2 size={16} /> Clear Database
          </button>
        </div>
      </div>
    </section>
  );
};

export default ExperimentalPanel;
