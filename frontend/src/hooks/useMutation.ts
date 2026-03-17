import { useState } from "react";
import type { AxiosRequestConfig } from "axios";
import api from "../api/api";

interface UseMutationState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export const useMutation = <T, P = any>() => {
  const [state, setState] = useState<UseMutationState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  const trigger = async (
    url: string,
    method: AxiosRequestConfig["method"],
    payload?: P,
    config?: AxiosRequestConfig,
  ) => {
    setState({ data: null, error: null, loading: true });
    try {
      const response = await api.request<T>({
        url,
        method,
        data: payload,
        ...config,
      });
      setState({ data: response.data, error: null, loading: false });
      return response.data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setState({ data: null, error: errorMsg, loading: false });
      throw err; // Re-throw so the component can handle specific logic if needed
    }
  };

  return {
    ...state,
    trigger,
    reset: () => setState({ data: null, error: null, loading: false }),
  };
};
