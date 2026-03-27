import { useMutation } from "./useMutation";

interface IngestResponse {
  status: string;
  total_chunks?: number;
  type?: string;
  message?: string;
}

export const useIngest = () => {
  const { trigger, loading, error, data } = useMutation<IngestResponse>();

  // useIngest.ts
  const uploadFiles = async (
    files: File[],
    strategy: string,
    chunkSize: number,
    overlap: number,
  ) => {
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file); // Key must be "file"
      formData.append("model_name", "auto");
      formData.append("chunk_strategy", strategy);
      formData.append("chunk_size", chunkSize.toString());
      formData.append("chunk_overlap", overlap.toString());
      formData.append("include_metadata", "true");

      try {
        // Pass an empty headers object or ensure config doesn't force JSON
        await trigger("/api/ingest", "post", formData, {
        });
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
      }
    }
  };

  return {
    uploadFiles,
    isUploading: loading,
    uploadError: error,
    uploadResult: data,
  };
};
