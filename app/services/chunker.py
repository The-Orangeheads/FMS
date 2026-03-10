from typing import List, Dict

class ChunkingService:
    def __init__(self):
        pass

    def chunk_fixed(self, text: str, chunk_size: int, overlap: int) -> List[str]:
        """
        Strategy 1: Fixed Size Chunking with configurable overlap.
        """
        chunks = []
        if chunk_size <= overlap:
            raise ValueError("Chunk size must be greater than overlap")
            
        step = chunk_size - overlap
        
        if step <= 0: step = 1
            
        for i in range(0, len(text), step):
            chunks.append(text[i : i + chunk_size])
        return chunks

    def chunk_recursive(self, text: str, chunk_size: int, overlap: int) -> List[str]:
        """
        Strategy 2: Recursive/Paragraph Chunking.
        Respects paragraph boundaries but forces overlap if specified.
        """
        chunks = []
        paragraphs = text.split("\n\n")
        current_chunk = ""
        
        for para in paragraphs:
            if len(current_chunk) + len(para) < chunk_size:
                current_chunk += para + "\n\n"
            else:
                chunks.append(current_chunk.strip())
                
                if overlap > 0 and len(current_chunk) > overlap:
                    overlap_text = current_chunk[-overlap:]
                    current_chunk = overlap_text + para + "\n\n"
                else:
                    current_chunk = para + "\n\n"
        
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
            
        return chunks

    def chunk_document(self, pages: List[Dict], strategy: str, chunk_size: int, overlap: int, include_metadata: bool, filename: str) -> List[Dict]:
        """
        Passes the user-defined size/overlap to the specific strategy.
        """
        final_chunks = []
        
        for page in pages:
            text = page["text"]
            page_num = page["page_number"]
            
            if strategy == "recursive":
                raw_chunks = self.chunk_recursive(text, chunk_size, overlap)
            else:
                raw_chunks = self.chunk_fixed(text, chunk_size, overlap)
            
            for idx, chunk_text in enumerate(raw_chunks):
                chunk_data = {
                    "text": chunk_text,
                    "chunk_id": f"{filename}_p{page_num}_{idx}",
                    "size": len(chunk_text)
                }
                
                if include_metadata:
                    chunk_data["metadata"] = {
                        "filename": filename,
                        "page_number": page_num,
                        "strategy": strategy,
                        "chunk_size": chunk_size,
                        "overlap": overlap
                    }
                
                final_chunks.append(chunk_data)
                
        return final_chunks