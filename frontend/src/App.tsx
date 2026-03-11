import React, { useState, useEffect } from "react";
import SideBar from "./components/layout/SideBar";
import UploadCenter from "./components/dashboard/UploadCenter";
import ContentBody from "./components/layout/ContentBody";
import { useIngest } from "./hooks/useIngest";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState("Dashboard");

  const { uploadFiles, isUploading, uploadError, uploadResult } = useIngest();
  useEffect(() => {
    if (uploadResult) {
      alert(
        `Success! Ingestion complete. Indexed ${uploadResult.total_chunks} total chunks.`,
      );
    }
  }, [uploadResult]);

  useEffect(() => {
    if (uploadError) {
      alert(`Upload failed: ${uploadError}`);
    }
  }, [uploadError]);

  const handleUpload = async (files: File[]) => {
    await uploadFiles(files, "recursive", 500, 50);
  };

  return (
    <div className="flex h-screen bg-[#0B141A] text-slate-300 font-sans overflow-hidden">
      <SideBar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <ContentBody activeTab={activeTab} isProcessing={isUploading} />

      {/* Upload Sidebar */}
      <UploadCenter isProcessing={isUploading} onFileUpload={handleUpload} />
    </div>
  );
};

export default App;
