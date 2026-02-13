export type ChunkingStrategy = "Recursive" | "Semantic" | "Character-based";
export type EmbeddingModel =
  | "Text-v2-Small"
  | "Text-v3-Large"
  | "Clip-v2 (Images)";
export type VectorDB = "Pinecone" | "Milvus" | "Weaviate";

export interface FileStatus {
  id: string;
  name: string;
  size: string;
  progress: number;
  status: "UPLOADING" | "EMBEDDING" | "COMPLETED" | "ERROR";
}

export interface QueryResult {
  text: string;
  score: number; // Confidence level (0-1)
  sourceFile: string;
}
