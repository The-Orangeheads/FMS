import { useState, useEffect } from "react";
import api from "../api/api";

const FALLBACK_CONFIG = {
  models: [
    { key: "bge-m3", capabilities: ["text"], languages: ["en", "multi"] },
    { key: "siglip2", capabilities: ["text", "image"], languages: ["en"] },
  ],
  strategies: ["fixed", "recursive"],
  databases: ["Chroma"],
};

export const useConfig = () => {
  const [config, setConfig] = useState<{
    models: any[];
    strategies: string[];
    databases: string[];
  } | null>(null);

  useEffect(() => {
    api
      .get("/api/config", { timeout: 8000 })
      .then((res) => setConfig(res.data))
      .catch(() => setConfig(FALLBACK_CONFIG));
  }, []);

  return config;
};
