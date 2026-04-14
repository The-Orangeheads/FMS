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
        Combines text across pages to hit large chunk limits, 
        while accurately mapping the chunks back to their starting page.
        """
        final_chunks = []
        
        if not pages:
            return final_chunks
            
        # 1. Stitch all pages together and map character indices to page numbers
        combined_text = ""
        page_map = []
        
        for page in pages:
            start_idx = len(combined_text)
            page_map.append((start_idx, page["page_number"]))
            
            # Add the text and force a double newline to ensure paragraph breaks between pages
            text = page.get("text", "")
            combined_text += text + "\n\n"
            
        # 2. Chunk the massive continuous string (Breaking the Page Barrier)
        if settings.chunk_strategy == "recursive":
            raw_chunks = self.chunk_recursive(combined_text, settings.chunk_size, settings.chunk_overlap)
        elif settings.chunk_strategy == "fixed":
            raw_chunks = self.chunk_fixed(combined_text, settings.chunk_size, settings.chunk_overlap)
        else:
            raise Exception("Invalid chunking strategy")
            
        # 3. Map the chunks back to their correct original pages
        current_search_idx = 0
        for chunk_text in raw_chunks:
            # Grab a slice to search for (100 chars is safe against repeating words)
            search_slice = chunk_text[:100] 
            idx = combined_text.find(search_slice, current_search_idx)
            
            # Fallback if somehow not found (extremely rare edge case)
            if idx == -1: 
                idx = current_search_idx 
                
            # Determine which page this starting index belongs to
            chunk_page_num = page_map[0][1]
            for start_index, p_num in page_map:
                if idx >= start_index:
                    chunk_page_num = p_num
                else:
                    break # We passed the index, keep the last valid page
                    
            final_chunks.append({
                "text": chunk_text,
                "page_number": chunk_page_num
            })
            
            # Advance the search index to avoid matching identical text from earlier pages
            # We subtract overlap so we don't accidentally skip the start of the next chunk
            current_search_idx = idx + max(1, len(chunk_text) - settings.chunk_overlap - 50)
            
        return final_chunks