import { Cloud } from "lucide-react";

const UploadCenter = ({ isProcessing }: { isProcessing: boolean }) => {
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

      <div className="mt-auto border-2 border-dashed border-slate-800 rounded-2xl p-6 text-center">
        <p className="text-sm text-slate-400 mb-4">Max file size: 50MB</p>
        <button className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded-lg text-white text-sm font-bold transition-colors">
          SELECT FILE
        </button>
      </div>
    </aside>
  );
};

export default UploadCenter;
