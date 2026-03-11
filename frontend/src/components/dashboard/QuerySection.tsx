import React, { useState, useRef } from "react";
import { Send, Loader2, AlertCircle, FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";

const QuerySection = ({ isProcessing, isQuerying, onRunQuery, results, error }: any) => {
  const [query, setQuery] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRunQuery = () => {
    // Check if there is either text or files before running
    if (isProcessing || isQuerying || (!query.trim() && attachedFiles.length === 0)) return;
    
    // Pass query and the array of files to the parent handler
    onRunQuery(query, attachedFiles);
    
    // Optional: Clear files after sending
    // setAttachedFiles([]); 
  };

  return (
    <section className="bg-[#15202B] border border-slate-800 rounded-xl p-6 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Ask your Data</h3>
        {(isProcessing || isQuerying) && (
          <div className="flex items-center gap-2 text-orange-400 text-sm italic">
            <Loader2 className="animate-spin" size={16} />
            {isProcessing ? "Files are still indexing..." : "Searching database..."}
          </div>
        )}
      </div>

      <div className="relative bg-[#1C2732] border border-slate-700 rounded-lg focus-within:border-blue-500 transition-colors">
        <textarea
          disabled={isProcessing || isQuerying}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for text or attach images to analyze..."
          className="w-full bg-transparent p-4 pb-12 focus:outline-none h-32 resize-none text-white text-sm"
        />

        {/* ATTACHED FILES PREVIEW */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {attachedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 px-2 py-1 rounded md text-[11px] text-slate-300">
                {file.type.startsWith('image/') ? <ImageIcon size={12} className="text-purple-400" /> : <FileText size={12} className="text-blue-400" />}
                <span className="truncate max-w-[120px]">{file.name}</span>
                <button onClick={() => removeFile(idx)} className="hover:text-red-400">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="absolute bottom-3 left-3 flex gap-2">
            <input 
                type="file" 
                multiple 
                ref={fileInputRef} 
                onChange={handleFileAttach} 
                className="hidden" 
                accept=".pdf,.txt,.docx,image/*"
            />
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-all"
                title="Attach files"
            >
                <Paperclip size={18} />
            </button>
        </div>

        <button
          onClick={handleRunQuery}
          disabled={isProcessing || isQuerying || (!query.trim() && attachedFiles.length === 0)}
          className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2"
        >
          {isQuerying ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
          {isQuerying ? "QUERYING..." : "RUN QUERY"}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* RESULTS LIST */}
      {Array.isArray(results) && results.length > 0 && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-800"></div>
            <p className="text-xs font-bold text-slate-500 uppercase">Unified Results</p>
            <div className="h-px flex-1 bg-slate-800"></div>
          </div>

          {results.map((res: any, i: number) => {
            const scoreToDisplay = res.displayScore || (res.score ? (res.score * 100).toFixed(1) : 0);
            
            return (
              <div
                key={i}
                className={`bg-[#1C2732] border-l-4 ${
                  res.type === "image" ? "border-purple-500" : "border-blue-500"
                } p-5 rounded-r-lg`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    {res.type === "image" ? <ImageIcon size={14} className="text-purple-400" /> : <FileText size={14} className="text-blue-400" />}
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      res.type === "image" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
                    }`}>
                      {scoreToDisplay}% {res.type === "image" ? "Visual Match" : "Text Match"}
                    </span>
                    {res.confidence && (
                        <span className="text-[9px] text-slate-500 font-mono">[{res.confidence.toUpperCase()}]</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 italic">Source: {res.sourceFile}</span>
                </div>

                {res.type === "image" ? (
                  <div className="space-y-3">
                    <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-slate-700">
                      <img
                        src={res.imagePath ? `/api/v1/files/display/${res.imagePath}` : ""}
                        alt="Result"
                        className="w-full h-auto max-h-[300px] object-contain"
                        onError={(e) => (e.currentTarget.src = "https://via.placeholder.com/400x225?text=Preview+Unavailable")}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{res.text}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default QuerySection;