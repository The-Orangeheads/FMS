// hooks/useVectorDb.ts
import { useState } from "react";
import api from "../api/api";

export const useVectorDb = () => {
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const handleClear = async (dbType: string) => {
    if (
      !window.confirm(`Are you sure you want to clear the ${dbType} database?`)
    )
      return;

    setIsClearing(true);
    setClearError(null);

    try {
      await api.delete(`/api/v1/vector-db/${dbType.toLowerCase()}/clear`);
      alert(`${dbType} database cleared successfully.`);
    } catch (err: any) {
      setClearError(err.message || "Failed to clear database");
      alert("Error clearing database: " + (err.message || "Unknown error"));
    } finally {
      setIsClearing(false);
    }
  };

  return { handleClear, isClearing, clearError };
};
