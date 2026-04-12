import os
import logging
import base64
import mimetypes
import re
from typing import List, Dict
from pathlib import Path

from app.core.text_handler import PDFTextHandler
from app.core.chunker import ChunkingService
from app.core.config import settings
from app.core.ocr import ocr
from app.services.embedding_service import embedding_service
from app.services.files_db_service import files_db_service

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
        extracted_images = []
        
        if ext == ".pdf":
            extracted_pages, extracted_images = self.pdf_handler.process_document(path)
            ocr.free_vram()
        elif ext == ".txt":
            with open(path, "r", encoding="utf-8") as f:
                extracted_pages = [{"page_number": 1, "text": f.read()}]
        else:
            raise Exception("Unsupported file type")

        for page in extracted_pages:
            if "text" in page and page["text"]:
                # 1. Compress horizontal whitespace (spaces, tabs) into a single space
                cleaned_text = re.sub(r'[ \t]+', ' ', page["text"])
                
                # 2. Compress extreme vertical whitespace (3+ newlines) down to exactly 2 (\n\n)
                page["text"] = re.sub(r'\n{3,}', '\n\n', cleaned_text)
        # =================================================================
        
        result_chunks = self.chunker.chunk_document(
            pages=extracted_pages
        )
        
        if notify_cb:
            notify_cb(f"Preprocessing chunks...: {os.path.basename(path)} : 5")
        
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
        
        if not valid_inputs:
            logger.warning(f"File {path} resulted in 0 valid chunks after filtering.")
            return {"status": "skipped", "message": "No meaningful text found in file."}

        # 3. Embed using ONLY the valid data
        embedded_data = embedding_service.process_embeddings(target_model, valid_inputs, notify_cb)

        stat = Path(path).stat()

        # 4. Store in DOCUMENTS

        if notify_cb:
            notify_cb(f"Storing embeddings... : {file_name} : 95")

        embeddings = []
        contents = []
        metadatas = []
        
        for idx, item in enumerate(embedded_data.results):
            # Use valid_raw_chunks instead of result_chunks to keep indices aligned
            text_content = valid_chunks[idx]['text']
            page_number = valid_chunks[idx]['page_number']
            embeddings.append(item.vector)
            contents.append(text_content)
            metadatas.append({
                "path": path,
                "page_number": page_number,
                "mdate": stat.st_mtime_ns,
                "fsize": stat.st_size
            })
        
        files_db_service.save_file(
            embeddings=embeddings,
            contents=contents,
            metadatas=metadatas,
            file_path=path,
            file_type="document",
            mdate=stat.st_mtime_ns,
            fsize=stat.st_size
        )

        self.clear_last_model()

        if extracted_images:

            target_model = (
                settings.DEFAULT_IMAGE_EMBEDDING_MODEL 
                if settings.cur_image_embedding_model == "auto" 
                else settings.cur_image_embedding_model
            )

            self.last_model = target_model

            chunksList = []

            for img in extracted_images:
                chunksList.append(ChunkInput(text=None, 
                                            image_base64=img["base64"], 
                                            metadata={"path": path, "page_number": img["page_number"]}))

            image_embedding_response = embedding_service.process_embeddings(target_model, chunksList, notify_cb)

            img_embeddings = []
            img_contents = []
            img_metadatas = []

            for idx, item in enumerate(image_embedding_response.results):
                img_embeddings.append(item.vector)
                img_contents.append(None)
                img_metadatas.append({
                    "path": path,
                    "page_number": extracted_images[idx]["page_number"],
                    "mdate": stat.st_mtime_ns,
                    "fsize": stat.st_size
                })

            files_db_service.save_file(
                    embeddings=img_embeddings,
                    contents=img_contents,
                    metadatas=img_metadatas,
                    file_path=path,
                    file_type="image",
                    mdate=stat.st_mtime_ns,
                    fsize=stat.st_size
                )
            
            self.clear_last_model()

    
    # This is standalone image processing
    """
    We'll divide this process into 3 phases, the aim
    of this is to decrease the vram usage as much as possible

    Phase 1: Visual Embedding (Embedding using SigLip2 and storing then unloading Model)
    Phase 2: OCR Text Extraction (Loading the OCR backend and extracting the text and unloading the OCR)
    Phase 3: Loading the text model embedding and unloading the model

    // This can potentially make a problem, since this means
    // at some point in time we'll have about 4 models lying
    // in the actual ram.
    """
    def process_image(self, path: str, notify_cb=None):
        logger.info(f"Processing image file: {path}")
        file_name = os.path.basename(path)
        
        target_model = (
            settings.DEFAULT_IMAGE_EMBEDDING_MODEL 
            if settings.cur_image_embedding_model == "auto" 
            else settings.cur_image_embedding_model
        )
        """
        Phase 1 (Siglip)
        """
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

        embeddings = []
        contents = []
        metadatas = []
        
        for item in embedded_data.results:
            embeddings.append(item.vector)
            contents.append(None)
            metadatas.append({
                "path": path,
                "mdate": stat.st_mtime_ns,
                "fsize": stat.st_size
                })

        files_db_service.save_file(
                embeddings=embeddings,
                contents=contents,
                metadatas=metadatas,
                file_path=path,
                file_type="image",
                mdate=stat.st_mtime_ns,
                fsize=stat.st_size
            )
        
        self.clear_last_model()

        """
        Phase 2 (OCR)
        """
        if not getattr(settings, "enable_ocr", True):
            logger.info(f"[file_handler] OCR disabled — skipping text extraction for {file_name}")
            return

        # Update Notify CB accordingly later

        ocr_text = ocr.extract_text(image_bytes)
        ocr.free_vram()

        min_len = getattr(settings, "ocr_min_text_length", 10)

        if not ocr_text or len(ocr_text.strip()) < min_len:
            logger.info(f"[file_handler] No meaningful OCR text in {file_name} — skipping text embedding")
            return
        
        """
        Phase 3 (Text Model)
        """
        # Update Notify CB // Not done yet

        target_model = (
                settings.DEFAULT_TEXT_EMBEDDING_MODEL
                if settings.cur_text_embedding_model == "auto"
                else settings.cur_text_embedding_model
            )

        self.last_model = target_model

        resulting_chunks = self.chunker.chunk_document([{"page_number": 1, "text": ocr_text}])

        valid_chunks = []
        valid_inputs = []

        for chunk in resulting_chunks:
            clean_text = " ".join(chunk['text'].split())
            
            # Only keep chunks that have actual alphanumeric characters and are longer than 5 chars
            if len(clean_text) > 5 and any(char.isalnum() for char in clean_text):
                valid_inputs.append(ChunkInput(
                    text=clean_text,
                    metadata={"path": path}
                ))
                valid_chunks.append(chunk)

        if not valid_inputs:
            logger.warning(f"File {path} resulted in 0 valid chunks after filtering. (In OCR)")
            return {"status": "skipped", "message": "No meaningful text found in file."}

        toEmbedd = embedding_service.process_embeddings(target_model, valid_inputs, notify_cb)
        
        embeddings = []
        contents = []
        metadatas = []
        
        for idx, item in enumerate(toEmbedd.results):
            # Use valid_raw_chunks instead of result_chunks to keep indices aligned
            text_content = valid_chunks[idx]['text']
            page_number = valid_chunks[idx]['page_number']
            embeddings.append(item.vector)
            contents.append(text_content)
            metadatas.append({
                "path": path,
                "page_number": page_number,
                "mdate": stat.st_mtime_ns,
                "fsize": stat.st_size
            })
        
        files_db_service.save_file(
            embeddings=embeddings,
            contents=contents,
            metadatas=metadatas,
            file_path=path,
            file_type="document",
            mdate=stat.st_mtime_ns,
            fsize=stat.st_size
        )

        self.clear_last_model()


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