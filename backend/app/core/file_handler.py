import os
import logging
import base64
import mimetypes
import re
from typing import List, Dict
from pathlib import Path

from app.core.pdf_handler import PDFHandler
from app.core.chunker import ChunkingService
from app.core.config import settings
from app.services.embedding_service import embedding_service
from app.services.files_db_service import files_db_service
from app.services.ocr_service import ocr

from app.schemas import ChunkInput

logger = logging.getLogger(__name__)

class FileHandler:
    TEXT_DOC_FORMATS = {".txt"}
    HYBRID_DOC_FORMATS = {".pdf"}
    
    def __init__(self):
        self.pdf_handler = PDFHandler()
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
        if ext in self.HYBRID_DOC_FORMATS:
            return "hybrid_document"
        if ext in self.TEXT_DOC_FORMATS:
            return "text_document"
        
        return "other"

    def _process_text(self, raw_pages, path: str, file_type: str, notify_cb=None, display_name: str = "", startPercent: int=0, endPercent: int=0):
        file_name = os.path.basename(path)
        
        target_model = (
            settings.DEFAULT_TEXT_EMBEDDING_MODEL
            if settings.cur_text_embedding_model == "auto"
            else settings.cur_text_embedding_model
        )

        self.last_model = target_model

        for page in raw_pages:
            if "text" in page and page["text"]:
                # 1. Compress horizontal whitespace (spaces, tabs) into a single space
                cleaned_text = re.sub(r'[ \t]+', ' ', page["text"])
                
                # 2. Compress extreme vertical whitespace (3+ newlines) down to exactly 2 (\n\n)
                page["text"] = re.sub(r'\n{3,}', '\n\n', cleaned_text)
        
        result_chunks = self.chunker.chunk_document(
            pages=raw_pages
        )
        
        if notify_cb:
            notify_cb(f"Preprocessing chunks...: {display_name} : {int(round(startPercent + (endPercent-startPercent)*0.05))}")
        
        # 2. Prepare Input for Text Model
        valid_chunks = []
        valid_inputs = []
        for chunk in result_chunks:
            # Final polish: collapses any remaining newlines within the chunk
            clean_text = " ".join(chunk['text'].split())
            
            # Only keep chunks that have actual alphanumeric characters and are longer than 5 chars
            if len(clean_text) > 5 and any(char.isalnum() for char in clean_text):
                valid_inputs.append(ChunkInput(
                    text=clean_text,
                    metadata={"path": path}
                ))
                valid_chunks.append(chunk)
        
        # 3. Embed using ONLY the valid data
        embedded_data = embedding_service.process_embeddings(target_model, valid_inputs, notify_cb, display_name, startPercent, endPercent)

        stat = Path(path).stat()

        # 4. Store in DOCUMENTS

        if notify_cb:
            notify_cb(f"Storing embeddings... : {display_name} : {int(round(startPercent + (endPercent-startPercent)*0.95))}")

        embeddings = []
        contents = []
        metadatas = []
        
        for idx, item in enumerate(embedded_data.results):
            # Use valid_raw_chunks instead of result_chunks to keep indices aligned
            text_content = valid_chunks[idx]['text']
            page_number = valid_chunks[idx]['page_number']
            meta = {
                "path": path,
                "mdate": stat.st_mtime_ns,
                "fsize": stat.st_size
            }
            if file_type != "image":
                meta["page_number"] = page_number
            
            embeddings.append(item.vector)
            contents.append(text_content)
            metadatas.append(meta)
        
        files_db_service.save_file(
            embed_type="document",
            embeddings=embeddings,
            contents=contents,
            metadatas=metadatas,
            file_path=path,
            file_type=file_type,
            mdate=stat.st_mtime_ns,
            fsize=stat.st_size
        )

    def _process_images(self, images: list, path: str, file_type: str, notify_cb=None, display_name: str = "", startPercent: int=0, endPercent: int=0):
        file_name = os.path.basename(path)
        stat = Path(path).stat()

        if not images:
            files_db_service.save_file(
                embed_type="image",
                embeddings=[],
                contents=[],
                metadatas=[],
                file_path=path,
                file_type=file_type,
                mdate=stat.st_mtime_ns,
                fsize=stat.st_size
            )
            return

        target_model = (
            settings.DEFAULT_IMAGE_EMBEDDING_MODEL 
            if settings.cur_image_embedding_model == "auto" 
            else settings.cur_image_embedding_model
        )

        self.last_model = target_model
        
        # 1. Read and Encode Image to Base64

        if notify_cb:
            notify_cb(f"Encoding... : {display_name} : {int(round(startPercent + (endPercent-startPercent)*0.10))}")

        # 2. Prepare Input for SigLIP
        inputs = []
        for image_bytes, page_num in images:
            inputs.append(ChunkInput(
                text=None,
                image_base64=base64.b64encode(image_bytes).decode('utf-8'),
                metadata={"path": path}
            ))
        
        # 3. Embed using the current images embedding model
        embedded_data = embedding_service.process_embeddings(target_model, inputs, notify_cb, display_name, startPercent, endPercent)

        # 4. Store in IMAGES Collection (storage_filename used for display endpoint)

        if notify_cb:
            notify_cb(f"Storing embeddings... : {display_name} : {int(round(startPercent + (endPercent-startPercent)*0.95))}")

        embeddings = []
        contents = []
        metadatas = []
        
        for i, item in enumerate(embedded_data.results):
            embeddings.append(item.vector)
            contents.append("")
            meta = {
                "path": path,
                "mdate": stat.st_mtime_ns,
                "fsize": stat.st_size
            }

            if file_type != "image":
                meta["page_number"] = images[i][1]
            
            metadatas.append(meta)

        files_db_service.save_file(
                embed_type="image",
                embeddings=embeddings,
                contents=contents,
                metadatas=metadatas,
                file_path=path,
                file_type=file_type,
                mdate=stat.st_mtime_ns,
                fsize=stat.st_size
            )

    def process_document(self, path: str, file_type: str, notify_cb=None, display_name: str = "") -> List[Dict]:
        logger.info(f"Processing text/document file: {path}")

        # 1. Process and Chunk Text
        if notify_cb:
            notify_cb(f"Extracting text...: {display_name}: 3")

        ext = Path(path).suffix.lower()
        extracted_pages = []
        
        if ext == ".pdf":
            extracted_pages = self.pdf_handler.process_document(path)
        elif ext == ".txt":
            with open(path, "r", encoding="utf-8") as f:
                extracted_pages = [{"page_number": 1, "text": f.read()}]
        else:
            raise Exception("Unsupported file type")

        self._process_text(extracted_pages, path, file_type, notify_cb, display_name, 0, 100)
        
    def process_image(self, path: str, file_type: str, notify_cb=None, display_name: str = ""):
        logger.info(f"Processing image file: {path}")

        if notify_cb:
            notify_cb(f"Reading Image...: {display_name}: 3")
        
        with open(path, "rb") as f:
            image_bytes = f.read()
        
        self._process_images([(image_bytes, 1)], path, file_type, notify_cb, display_name, 3, 100)

    def process_image_text(self, path: str, file_type: str, notify_cb=None, display_name: str = ""):
        logger.info(f"Processing image->text file: {path}")
        file_name = os.path.basename(path)
        
        target_model = (
            settings.DEFAULT_TEXT_EMBEDDING_MODEL
            if settings.cur_text_embedding_model == "auto"
            else settings.cur_text_embedding_model
        )

        self.last_model = target_model

        if notify_cb:
            notify_cb(f"Reading image... : {display_name} : 5")
            
        with open(path, "rb") as f:
            image_bytes = f.read()

        if notify_cb:
            notify_cb(f"Extracting Text... : {display_name} : 30")
        
        pages = [{"page_number": 1, "text": ocr.extract_text(image_bytes)}]

        self._process_text(pages, path, file_type, notify_cb, display_name, 30, 100)

    def process_document_images(self, path: str, file_type: str, notify_cb=None, display_name: str = ""):
        if notify_cb:
            notify_cb(f"Extracting Images...: {display_name}: 5")
        
        images = self.pdf_handler.extract_images_data(path)
        self._process_images(images, path, file_type, notify_cb, display_name, 5, 100)
    
    def clear_last_model(self):
        if not self.last_model:
            return
        embedding_service._get_model(self.last_model).free_vram()
        self.last_type = None

    def process_file(self, path, embd_type, clear_last = False, notify_cb=None, display_name: str = ""):
        if settings.chunk_size <= settings.chunk_overlap:
            raise Exception("Chunk size cannot be less than or equal to the chunk overlap")
        
        if not os.path.exists(path):
            raise Exception("File not found")

        file_type = self.detect_file_type(path)

        if clear_last and embd_type != self.last_type:
            self.clear_last_model()
            self.last_type = embd_type
    
        # IMAGE PROCESSING
        if file_type == "image":
            if embd_type == "image":
                self.process_image(path, file_type, notify_cb, display_name)
            else:
                self.process_image_text(path, file_type, notify_cb, display_name)
        # TEXT/DOCUMENT PROCESSING
        elif file_type == "text_document" or file_type == "hybrid_document":
            if embd_type == "document":
                self.process_document(path, file_type, notify_cb, display_name)
            if embd_type == "image" and file_type == "hybrid_document":
                self.process_document_images(path, file_type, notify_cb, display_name)
        else:
            raise Exception("Unsupported file type")