from typing import List, Dict
from app.core.config import settings
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
        if chunk_size <= overlap:
            raise ValueError("Chunk size must be greater than overlap")
        
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

    def chunk_document(self, pages: List[Dict]) -> List[Dict]:
        """
        Passes the user-defined size/overlap to the specific strategy.
        """
        final_chunks = []
        
        for page in pages:
            text = page["text"]
            page_num = page["page_number"]
            
            if settings.chunk_strategy == "recursive":
                raw_chunks = self.chunk_recursive(text, settings.chunk_size, settings.chunk_overlap)
            elif settings.chunk_strategy == "fixed":
                raw_chunks = self.chunk_fixed(text, settings.chunk_size, settings.chunk_overlap)
            else:
                raise Exception("Invalid chunking strategy")
            
            for idx, chunk_text in enumerate(raw_chunks):
                chunk_data = {
                    "text": chunk_text,
                    "page_number": page_num
                }
                
                final_chunks.append(chunk_data)
                
        return final_chunks