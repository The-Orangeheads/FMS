
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

export type ChunkingStrategy = "fixed" | "recursive" | "semantic";
export type EmbeddingModel = "bge-m3" | "arabic-sbert" | "siglip2" | "auto";
export type VectorDB = "Chroma";

export interface BackendModelConfig {
  key: string;
  capabilities: string[];
  languages: string[];
}