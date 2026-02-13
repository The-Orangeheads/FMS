import React, { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import type { QueryResult } from "../../types";

interface Props {
  isProcessing: boolean;
  maxChars: number;
}

const QuerySection: React.FC<Props> = ({ isProcessing, maxChars }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QueryResult[]>([]);

  const handleRunQuery = () => {
    // Dummy result
    setResults([
      {
        text: "The meeting notes indicate that the project deadline is set for December 15th.",
        score: 0.98,
        sourceFile: "FMS gp meeting notes.pdf",
      },
    ]);
  };

  return (
    <section className="bg-[#15202B] border border-slate-800 rounded-xl p-6 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Ask your Data</h3>
        {isProcessing && (
          <div className="flex items-center gap-2 text-orange-400 text-sm italic">
            <Loader2 className="animate-spin" size={16} /> Files are still
            indexing...
          </div>
        )}
      </div>

      <div className="relative">
        <textarea
          disabled={isProcessing}
          maxLength={maxChars}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            isProcessing
              ? "Querying is disabled while files are processing..."
              : "Ask something about your documents..."
          }
          className={`w-full bg-[#1C2732] border border-slate-700 rounded-lg p-4 pb-12 focus:outline-none focus:border-blue-500 h-32 resize-none transition-all ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        />
        <div className="absolute bottom-3 left-4 text-[10px] text-slate-500 font-mono">
          {query.length} / {maxChars} CHARACTERS
        </div>
        <button
          onClick={handleRunQuery}
          disabled={isProcessing || !query}
          className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all"
        >
          <Send size={14} /> RUN QUERY
        </button>
      </div>

      {results.length > 0 && (
        <div className="mt-6 space-y-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Top Results
          </p>
          {results.map((res, i) => (
            <div
              key={i}
              className="bg-[#1C2732] border-l-4 border-blue-500 p-4 rounded-r-lg"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-bold uppercase">
                  Score: {(res.score * 100).toFixed(1)}% Confidence
                </span>
                <span className="text-[10px] text-slate-500 italic">
                  Source: {res.sourceFile}
                </span>
              </div>
              <p className="text-slate-200 text-sm leading-relaxed">
                {res.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default QuerySection;
