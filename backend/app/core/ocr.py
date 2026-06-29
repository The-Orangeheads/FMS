"""
OCR text-ingestion adapter for FMS.

Contract: extract_text(image_bytes) -> str
Used by image->document ingestion and PDF embedded-image extraction.
"""

from app.core.hybrid_ocr_engine import HybridOCREngine


class OCR:
    def __init__(self):
        self._engine = HybridOCREngine()

    def extract_text(self, image: bytes) -> str:
        return self._engine.extract_text(image)
