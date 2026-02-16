import React, { useRef } from "react";
import { Cloud, Loader2, FileUp } from "lucide-react";

interface Props {
  isProcessing: boolean;
  onFileUpload: (file: File) => void;
}

const UploadCenter = ({ isProcessing, onFileUpload }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      // Reset input so the same file can be uploaded again if needed
      e.target.value = "";
    }
  };

  return (
    <aside className="w-80 bg-[#15202B] border-l border-slate-800 p-6 flex flex-col">
      <div className="mb-6">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Cloud className="text-blue-400" size={18} /> Upload Center
        </h3>
        <p className="text-[10px] text-slate-500 uppercase font-bold mt-1 tracking-wider">
          Background Indexing
        </p>
      </div>

      {/* REQUIREMENT: Show active status if processing */}
      {isProcessing && (
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl animate-pulse">
          <div className="flex items-center gap-3 text-blue-400 mb-2">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-xs font-bold uppercase">Indexing...</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-progress origin-left w-2/3" />
          </div>
        </div>
      )}

      <div className="mt-auto border-2 border-dashed border-slate-800 rounded-2xl p-6 text-center hover:border-slate-700 transition-colors">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-slate-800/50 rounded-full text-slate-500">
            <FileUp size={24} />
          </div>
        </div>

        <p className="text-sm text-slate-400 mb-4">Max file size: 50MB</p>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.txt,.docx"
        />

        <button
          onClick={handleButtonClick}
          disabled={isProcessing}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 py-2 rounded-lg text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
        >
          {isProcessing ? "PROCESSING..." : "SELECT FILE"}
        </button>
      </div>
    </aside>
  );
};

export default UploadCenter;
