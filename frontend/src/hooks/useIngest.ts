import { useMutation } from "./useMutation";

interface IngestResponse {
  status: string;
  total_chunks: number;
  chunks: any[]; // Replace 'any' with your Chunk interface
}

export const useIngest = () => {
  const { trigger, loading, error, data } = useMutation<IngestResponse>();

  const uploadFile = async (
    file: File,
    strategy: string,
    chunkSize: number,
    overlap: number,
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("chunk_strategy", strategy);
    formData.append("chunk_size", chunkSize.toString());
    formData.append("chunk_overlap", overlap.toString());
    formData.append("include_metadata", "true");

    await trigger("/api/v1/ingest", "post", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  };

  return {
    uploadFile,
    isUploading: loading,
    uploadError: error,
    uploadResult: data,
  };
};
