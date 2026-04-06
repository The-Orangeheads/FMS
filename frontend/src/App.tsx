import React, { useState, useEffect } from "react";
import SideBar from "./components/layout/SideBar";
import IndexingQueue from "./components/dashboard/IndexingQueue";
import type { QueueItem } from "./components/dashboard/IndexingQueue";
import ContentBody from "./components/layout/ContentBody";

// Change this here, Mr. Procrastinator Hunter.
const WEBSOCKET_URL = "ws://localhost:8000/ws/queue";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSync = async () => {
    try {
      await fetch("http://localhost:8000/sync", { method: "POST" });
    } catch (err) {
      console.error("Sync failed:", err);
    }
  };

  useEffect(() => {
    const ws = new WebSocket(WEBSOCKET_URL);

    ws.onmessage = (event) => {
      const data: QueueItem = JSON.parse(event.data);

      setQueue((prev) => {
        const existing = prev.findIndex((q) => q.path === data.path);
        if (existing !== -1) {
          const updated = [...prev];
          updated[existing] = data;
          return updated;
        }
        return [...prev, data];
      });
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    return () => ws.close();
  }, []);

  // Decide isProcessing from queue state
  useEffect(() => {
    setIsProcessing(
      queue.some((q) => q.status === "processing" || q.status === "embedding"),
    );
  }, [queue]);

  return (
    <div className="flex h-screen bg-[#0B141A] text-slate-300 font-sans overflow-hidden">
      <SideBar activeTab={activeTab} setActiveTab={setActiveTab} />
      <ContentBody activeTab={activeTab} isProcessing={isProcessing} />
      <IndexingQueue
        queue={queue}
        isProcessing={isProcessing}
        onSync={handleSync}
      />
    </div>
  );
};

export default App;
