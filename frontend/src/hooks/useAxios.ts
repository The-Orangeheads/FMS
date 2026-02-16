import { useState, useEffect, useCallback, useRef } from "react";
import type { AxiosRequestConfig } from "axios";
import { CanceledError } from "axios";
import api from "../api/api";

// defining the shape of our hook's return state
interface UseAxiosState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export const useAxios = <T>(
  url: string,
  method: AxiosRequestConfig["method"] = "get",
  payload?: any,
) => {
  const [state, setState] = useState<UseAxiosState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  // use a ref to store the controller to handle aborts
  const controllerRef = useRef<AbortController>(new AbortController());

  const fetchData = useCallback(async () => {
    // abort any previous unfinished request
    controllerRef.current.abort();
    controllerRef.current = new AbortController();

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const response = await api.request<T>({
        url,
        method,
        data: payload,
        signal: controllerRef.current.signal,
      });

      setState({ data: response.data, error: null, loading: false });
    } catch (err) {
      if (err instanceof CanceledError) return;

      setState({
        data: null,
        error: err instanceof Error ? err.message : "An unknown error occurred",
        loading: false,
      });
    }
  }, [url, method, JSON.stringify(payload)]); // stringified it to prevent infinite loops

  useEffect(() => {
    fetchData();
    return () => controllerRef.current.abort();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
};
