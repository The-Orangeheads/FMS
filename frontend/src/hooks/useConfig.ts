import { useState, useEffect } from "react";
import api from "../api/api";

export const useConfig = () => {
  const [config, setConfig] = useState<{
    models: any[];
    strategies: string[];
    databases: string[];
  } | null>(null);

  useEffect(() => {
    api.get("/api/v1/config").then((res) => setConfig(res.data));
  }, []);

  return config;
};
