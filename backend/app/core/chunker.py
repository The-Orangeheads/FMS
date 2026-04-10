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
        Respects paragraph boundaries where possible, enforces overlap, 
        and strictly enforces chunk_size even on massive paragraphs.
        """
        if chunk_size <= overlap:
            raise ValueError("Chunk size must be greater than overlap")
        
        chunks = []
        paragraphs = text.split("\n\n")
        current_chunk = ""
        
        for para in paragraphs:
            # --- Emergency Fallback for Oversized Paragraphs ---
            if len(para) > chunk_size:
                # 1. Save whatever we currently have in the buffer
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                    # Grab overlap to bridge into the giant paragraph
                    overlap_text = current_chunk[-overlap:] if overlap > 0 else ""
                    current_chunk = overlap_text
                
                # 2. Add the giant paragraph to our current text
                combined_text = current_chunk + para
                
                # 3. Slice it down strictly by chunk_size
                while len(combined_text) > chunk_size:
                    chunks.append(combined_text[:chunk_size].strip())
                    # Step forward, retaining the overlap for the next slice
                    combined_text = combined_text[chunk_size - overlap:]
                
                # 4. Keep the leftover tail end for the next loop iteration
                current_chunk = combined_text + "\n\n"
                continue 
            # ---------------------------------------------------

            # --- Normal logic for paragraphs that fit ---
            if len(current_chunk) + len(para) < chunk_size:
                current_chunk += para + "\n\n"
            else:
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                
                if overlap > 0 and len(current_chunk) > overlap:
                    overlap_text = current_chunk[-overlap:]
                    current_chunk = overlap_text + para + "\n\n"
                else:
                    current_chunk = para + "\n\n"
        
        # Catch anything left in the buffer at the very end
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