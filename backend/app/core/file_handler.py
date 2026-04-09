import os
import logging
import base64
import mimetypes
from typing import List, Dict
from pathlib import Path

from app.core.text_handler import PDFTextHandler
from app.core.chunker import ChunkingService
from app.core.config import settings
from app.services import vector_db_service
from app.services.embedding_service import embedding_service

from app.schemas import ChunkInput

logger = logging.getLogger(__name__)

class FileHandler:
    SUPPORTED_DOC_FORMATS = {".pdf", ".txt"}
    
    def __init__(self):
        self.pdf_handler = PDFTextHandler()
        self.chunker = ChunkingService()

        self.last_type : str | None = None
        self.last_model : str | None = None
    
    def detect_file_type(self, path: str) -> str:
        """
            returns either "image" or "audio" or "document" or "other"
        """
        mime_type, _ = mimetypes.guess_type(path)
        mime_type = mime_type or ""
        # IMAGE PROCESSING
        if mime_type.startswith("image/"):
            return "image"
        if mime_type.startswith("audio/"):
            return "audio"
        
        ext = Path(path).suffix.lower()
        if ext in self.SUPPORTED_DOC_FORMATS:
            return "document"
        
        return "other"

    def process_document(self, path: str, notify_cb=None) -> List[Dict]:
        logger.info(f"Processing text/document file: {path}")
        file_name = os.path.basename(path)
        
        target_model = (
            settings.DEFAULT_TEXT_EMBEDDING_MODEL
            if settings.cur_text_embedding_model == "auto"
            else settings.cur_text_embedding_model
        )

        self.last_model = target_model
        
        # 1. Process and Chunk Text
        if notify_cb:
            notify_cb(f"Extracting text...: {os.path.basename(path)}, 3")

        ext = Path(path).suffix.lower()
        extracted_pages = []
        
        if ext == ".pdf":
            extracted_pages = self.pdf_handler.process_document(path)
        elif ext == ".txt":
            with open(path, "r", encoding="utf-8") as f:
                extracted_pages = [{"page_number": 1, "text": f.read()}]
        else:
            raise Exception("Unsupported file type")
        
        result_chunks = self.chunker.chunk_document(
            pages=extracted_pages
        )
        
        if notify_cb:
            notify_cb(f"Preprocessing chunks...: {os.path.basename(path)} : 5")
        
        # 2. Prepare Input for Text Model
        valid_chunks = []
        valid_inputs = []
        for chunk in result_chunks:
            clean_text = " ".join(chunk['text'].split())
            # Only keep chunks that have actual alphanumeric characters and are longer than 5 chars
            if len(clean_text) > 5 and any(char.isalnum() for char in clean_text):
                valid_inputs.append(ChunkInput(
                    text=clean_text,
                    metadata={"path": path}
                ))
                valid_chunks.append(chunk)
        
        if not valid_inputs:
            logger.warning(f"File {path} resulted in 0 valid chunks after filtering.")
            return {"status": "skipped", "message": "No meaningful text found in file."}

        # 3. Embed using ONLY the valid data
        embedded_data = embedding_service.process_embeddings(target_model, valid_inputs, notify_cb)

        stat = Path(path).stat()

        # 4. Store in DOCUMENTS

        if notify_cb:
            notify_cb(f"Storing embeddings... : {file_name} : 95")

        for idx, item in enumerate(embedded_data.results):
            # Use valid_raw_chunks instead of result_chunks to keep indices aligned
            text_content = valid_chunks[idx]['text']
            page_number = valid_chunks[idx]['page_number']
            vector_db_service.documents_db_service.insert(
                embedding=item.vector,
                file_path=path,
                content=text_content,
                metadata={
                    "page_number": page_number,
                    "mdate": stat.st_mtime_ns,
                    "fsize": stat.st_size
                }
            )
    
    def process_image(self, path: str, notify_cb=None):
        logger.info(f"Processing image file: {path}")
        file_name = os.path.basename(path)
        
        target_model = (
            settings.DEFAULT_IMAGE_EMBEDDING_MODEL 
            if settings.cur_image_embedding_model == "auto" 
            else settings.cur_image_embedding_model
        )

        self.last_model = target_model
        
        # 1. Read and Encode Image to Base64

        if notify_cb:
            notify_cb(f"Encoding image... : {file_name} : 10")
            
        with open(path, "rb") as f:
            image_bytes = f.read()
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        # 2. Prepare Input for SigLIP (No chunking needed for single images)
        inputs = [ChunkInput(
            text=None,
            image_base64=image_b64,
            metadata={"path": path}
        )]
        
        # 3. Embed using the current images embedding model
        
        embedded_data = embedding_service.process_embeddings(target_model, inputs, notify_cb)

        stat = Path(path).stat()
        
        # 4. Store in IMAGES Collection (storage_filename used for display endpoint)

        if notify_cb:
            notify_cb(f"Storing embedding... : {file_name} : 95")
        
        for idx, item in enumerate(embedded_data.results):
            vector_db_service.images_db_service.insert(
                embedding=item.vector,
                file_path=path,
                metadata={
                    "mdate": stat.st_mtime_ns,
                    "fsize": stat.st_size
                }
            )
    

    def clear_last_model(self):
        if not self.last_model:
            return
        embedding_service._get_model(self.last_model).free_vram()

    def process_file(self, path, clear_last = False, notify_cb=None):
        if settings.chunk_size <= settings.chunk_overlap:
            raise Exception("Chunk size cannot be less than or equal to the chunk overlap")
        
        if not os.path.exists(path):
            raise Exception("File not found")

        file_type = self.detect_file_type(path)

        if clear_last and file_type != self.last_type:
            self.last_type = file_type
            self.clear_last_model()

        # IMAGE PROCESSING
        if file_type == "image":
            self.process_image(path, notify_cb)
            
        # TEXT/DOCUMENT PROCESSING
        elif file_type == "document":
            self.process_document(path, notify_cb)
        else:
            raise Exception("Unsupported file type")