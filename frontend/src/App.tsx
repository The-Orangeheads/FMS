import React, { useState } from "react";
import { Search } from "lucide-react";
import SideBar from "./components/layout/SideBar";
import ExperimentalPanel from "./components/dashboard/ExperimentalPanel";
import QuerySection from "./components/dashboard/QuerySection";
import type { ChunkingStrategy, EmbeddingModel, VectorDB } from "./types";
import UploadCenter from "./components/dashboard/UploadCenter";
import ContentBody from "./components/layout/ContentBody";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [isProcessing, setIsProcessing] = useState(false);

  return (
    <div className="flex h-screen bg-[#0B141A] text-slate-300 font-sans overflow-hidden">
      <SideBar activeTab={activeTab} setActiveTab={setActiveTab} />

      <ContentBody activeTab={activeTab} isProcessing={isProcessing} />

      <UploadCenter isProcessing={isProcessing} />
    </div>
  );
};

export default App;
