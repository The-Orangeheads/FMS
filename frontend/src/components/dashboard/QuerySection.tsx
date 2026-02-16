import React, { useState } from "react";
import { Send, Loader2, AlertCircle, FileText, Image as ImageIcon } from "lucide-react";
import type { QueryResult } from "../../types";

interface Props {
  isProcessing: boolean; // Indexing status
  isQuerying: boolean;   // API request status
  maxChars: number;
  onRunQuery: (query: string) => void;
  results: QueryResult[] | null;
  error: string | null;
}

const QuerySection: React.FC<Props> = ({
  isProcessing,
  isQuerying,
  maxChars,
  onRunQuery,
  results,
  error,
}) => {
  const [query, setQuery] = useState("");

  const handleRunQuery = () => {
    if (isProcessing || isQuerying || !query.trim()) return;
    onRunQuery(query);
  };

  return (
    <section className="bg-[#15202B] border border-slate-800 rounded-xl p-6 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Ask your Data</h3>
        
        {/* Status Indicators */}
        {(isProcessing || isQuerying) && (
          <div className="flex items-center gap-2 text-orange-400 text-sm italic">
            <Loader2 className="animate-spin" size={16} />
            {isProcessing
              ? "Files are still indexing..."
              : "Searching database..."}
          </div>
        )}
      </div>

      <div className="relative">
        <textarea
          disabled={isProcessing || isQuerying}
          maxLength={maxChars}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleRunQuery();
            }
          }}
          placeholder={
            isProcessing ? "Disabled while processing..." : "Search for text or images..."
          }
          className={`w-full bg-[#1C2732] border border-slate-700 rounded-lg p-4 pb-12 focus:outline-none focus:border-blue-500 h-32 resize-none transition-all ${
            isProcessing || isQuerying ? "opacity-50 cursor-not-allowed" : ""
          }`}
        />

        <div className="absolute bottom-3 left-4 text-[10px] text-slate-500 font-mono uppercase">
          {query.length} / {maxChars} Characters
        </div>

        <button
          onClick={handleRunQuery}
          disabled={isProcessing || isQuerying || !query.trim()}
          className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all shadow-lg"
        >
          {isQuerying ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Send size={14} />
          )}
          {isQuerying ? "QUERYING..." : "RUN QUERY"}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Results List */}
      {Array.isArray(results) && results.length > 0 && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-800"></div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
              Unified Search Results
            </p>
            <div className="h-px flex-1 bg-slate-800"></div>
          </div>

          {results.map((res: any, i) => (
            <div
              key={i}
              className={`bg-[#1C2732] border-l-4 ${
                res.type === "image" ? "border-purple-500" : "border-blue-500"
              } p-5 rounded-r-lg animate-in fade-in slide-in-from-top-4 duration-300`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  {res.type === "image" ? (
                    <ImageIcon size={14} className="text-purple-400" />
                  ) : (
                    <FileText size={14} className="text-blue-400" />
                  )}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      res.type === "image"
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {(res.score * 100).toFixed(1)}%{" "}
                    {res.type === "image" ? "Visual Match" : "Text Relevance"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 italic font-medium">
                  Source: {res.sourceFile}
                </span>
              </div>

              {res.type === "image" ? (
                <div className="space-y-3">
                  <div className="relative group w-full max-w-md overflow-hidden rounded-lg border border-slate-700 bg-black/40">
                    <img
                      src={`/api/v1/files/display/${res.imagePath}`}
                      alt={res.sourceFile}
                      className="object-contain w-full h-auto max-h-[300px] transition-transform duration-500 group-hover:scale-[1.02]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://via.placeholder.com/400x225?text=Preview+Unavailable";
                      }}
                    />
                  </div>
                  <p className="text-slate-400 text-xs italic">
                    Found in visual library: {res.sourceFile}
                  </p>
                </div>
              ) : (
                <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {res.text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default QuerySection;