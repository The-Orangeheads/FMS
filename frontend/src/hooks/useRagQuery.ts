import { useMutation } from "./useMutation";

interface QueryResponse {
  results: Array<{ text: string; score: number; metadata: any }>;
}

export interface QuerySettings {
  model_name: string;
  k: number;
}

export const useRagQuery = () => {
  const { trigger, ...state } = useMutation<QueryResponse>();

  const runQuery = async (
    queryText: string,
    collection: string,
    settings: QuerySettings,
  ) => {
    if (queryText.trim().length === 0) return;

    await trigger(`/api/vectors/${collection}/query`, "post", {
      text: queryText,
      k: settings.k,
      model_name: settings.model_name,
    });
  };

  return { runQuery, ...state };
};
