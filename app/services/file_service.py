import os
import shutil
from typing import List, Dict
from fastapi import UploadFile
from pathlib import Path

from app.services.text_handler import PDFTextHandler
from app.services.chunker import ChunkingService

class FileService:
    def __init__(self):
        self.pdf_handler = PDFTextHandler()
        self.chunker = ChunkingService()
        self.upload_dir = "temp_uploads"
        os.makedirs(self.upload_dir, exist_ok=True)

    async def save_upload(self, file: UploadFile) -> str:
        file_path = os.path.join(self.upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return file_path

    def process_and_chunk(self, file_path: str, filename: str, strategy: str, chunk_size: int, overlap: int, include_metadata: bool) -> List[Dict]:
        ext = Path(file_path).suffix.lower()
        extracted_pages = []

        try:
            if ext == ".pdf":
                extracted_pages = self.pdf_handler.process_document(file_path)
            elif ext == ".txt":
                with open(file_path, "r", encoding="utf-8") as f:
                    extracted_pages = [{"page_number": 1, "text": f.read()}]
            
            return self.chunker.chunk_document(
                pages=extracted_pages,
                strategy=strategy,
                chunk_size=chunk_size,
                overlap=overlap,
                include_metadata=include_metadata,
                filename=filename
            )

        finally:
            if os.path.exists(file_path):
                os.remove(file_path)