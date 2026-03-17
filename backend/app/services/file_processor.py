"""
File processing module
Handles text extraction from various file formats
"""

import os
import PyPDF2
from docx import Document
from pathlib import Path
from typing import Tuple
import logging
import easyocr
import numpy as np

# logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class FileProcessor:
    """
    Handles text extraction from multiple file formats:
    - PDF (with PyPDF2)
    - DOCX (with python-docx)
    - TXT
    - Images (with EasyOCR for Arabic + English support)
    """
    
    def __init__(self, max_size_mb: int = 50):
        """
        Initialize FileProcessor
        
        Args:
            max_size_mb: Maximum file size in MB
        """
        
        self.max_size_bytes = max_size_mb * 1024 * 1024
        
        # initialize OCR reader once, reuse for all images (singleton)
        logger.info("Initializing EasyOCR reader...")
        try:
            self.ocr_reader = easyocr.Reader(
                ['en', 'ar'],
                gpu=self.has_gpu()
            )
            logger.info("OCR reader initialized")
        except Exception as e:
            logger.error(f"Failed to initialize OCR: {e}")
            self.ocr_reader = None
    
    def has_gpu(self) -> bool:
        """
        Check if CUDA GPU is available
        """
        try:
            import torch
            return torch.cuda.is_available()
        except:
            return False
    
    def validate_file(self, file_path: str) -> Tuple[bool, str]:
        """
        Validate that file exists and is within size limits.
        
        Args:
            file_path: Path to file
            
        Returns:
            Tuple of (is_valid, message)
        """
        try:
            path = Path(file_path)
            
            # check existence
            if not path.exists():
                return False, f"File not found: {file_path}"
            
            # check size
            file_size = path.stat().st_size
            if file_size > self.max_size_bytes:
                max_mb = self.max_size_bytes / (1024 * 1024)
                return False, f"File exceeds {max_mb}MB limit (actual: {file_size / (1024 * 1024):.2f}MB)"
            
            # check readability
            if not os.access(file_path, os.R_OK):
                return False, "File not readable"
            
            return True, "Valid"
            
        except Exception as e:
            return False, str(e)
    
    def extract_pdf(self, file_path: str) -> str:
        """
        Extract text from PDF file
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Extracted text string
            
        Raises:
            Exception: If extraction fails
        """
        try:
            logger.info(f"Extracting PDF: {file_path}")
            text_pages = []
            
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                num_pages = len(reader.pages)
                logger.info(f"PDF has {num_pages} pages")
                
                for page_num, page in enumerate(reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text and len(page_text.strip()) > 0:
                            text_pages.append(f"[PAGE {page_num + 1}]\n{page_text}\n")
                            logger.debug(f"Extracted {len(page_text)} chars from page {page_num + 1}")
                        else:
                            logger.warning(f"Page {page_num + 1} returned empty text")
                    except Exception as e:
                        logger.warning(f"Failed to extract page {page_num + 1}: {e}")
            
            result = "".join(text_pages)
            logger.info(f" Extracted {len(result)} characters from PDF")
            return result
            
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            raise
    
    def extract_docx(self, file_path: str) -> str:
        """
        Extract text from DOCX file.
        
        Args:
            file_path: Path to DOCX file
            
        Returns:
            Extracted text string
        """
        try:
            logger.info(f"Extracting DOCX: {file_path}")
            doc = Document(file_path)
            text_parts = []
            
            # Extract from paragraphs
            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text)
            
            logger.info(f"Extracted {len(doc.paragraphs)} paragraphs")
            
            # Extract from tables
            for table_idx, table in enumerate(doc.tables):
                logger.info(f"Extracting table {table_idx + 1}")
                for row in table.rows:
                    row_text = []
                    for cell in row.cells:
                        if cell.text.strip():
                            row_text.append(cell.text)
                    if row_text:
                        text_parts.append(" | ".join(row_text))
            
            result = "\n".join(text_parts)
            logger.info(f" Extracted {len(result)} characters from DOCX")
            return result
            
        except Exception as e:
            logger.error(f"DOCX extraction failed: {e}")
            raise
    
    def extract_text(self, file_path: str) -> str:
        """
        Extract text from plain text file.
        
        Args:
            file_path: Path to text file
            
        Returns:
            File contents as string
        """
        try:
            logger.info(f"Reading text file: {file_path}")
            
            # Try utf-8 first
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                # Fallback to latin-1
                logger.warning("UTF-8 decoding failed, trying latin-1")
                with open(file_path, 'r', encoding='latin-1') as f:
                    content = f.read()
            
            logger.info(f" Read {len(content)} characters from text file")
            return content
            
        except Exception as e:
            logger.error(f"Text extraction failed: {e}")
            raise
    
    def extract_image_text(self, file_path: str) -> str:
        """
        Extract text from image using OCR (supports English + Arabic)
        
        Args:
            file_path: Path to image file
            
        Returns:
            Extracted text string
        """
        if self.ocr_reader is None:
            raise RuntimeError("OCR reader not initialized")
        
        try:
            logger.info(f"Extracting text from image: {file_path}")
            
            # Run OCR
            results = self.ocr_reader.readtext(file_path)
            text_parts = []
            
            for detection in results:
                # detection = ([[x,y], ...], text, confidence)
                extracted_text = detection
                confidence = detection
                
                if confidence > 0.3:  # Filter low-confidence detections
                    text_parts.append(extracted_text)
                    logger.debug(f"OCR: '{extracted_text}' (confidence: {confidence:.2f})")
            
            result = "\n".join(text_parts)
            logger.info(f" Extracted {len(result)} characters from image via OCR")
            return result
            
        except Exception as e:
            logger.error(f"Image OCR failed: {e}")
            raise
    
    def process_file(self, file_path: str, file_type: str = None) -> str:
        """
        Main method to extract text from any supported file type.
        
        Args:
            file_path: Path to file
            file_type: File extension (pdf, docx, txt, jpg, png). 
                      If None, inferred from filename
            
        Returns:
            Extracted text
            
        Raises:
            ValueError: If file type not supported or file invalid
        """
        # validate file first
        is_valid, message = self.validate_file(file_path)
        if not is_valid:
            raise ValueError(f"File validation failed: {message}")
        
        # Get file type if not provided
        if file_type is None:
            file_type = Path(file_path).suffix.lstrip('.')
        
        file_type = file_type.lower()
        logger.info(f"Processing file as type: {file_type}")
        
        # Route to suitable extractor
        if file_type == "pdf":
            return self.extract_pdf(file_path)
        elif file_type in ["docx", "doc"]:
            return self.extract_docx(file_path)
        elif file_type == "txt":
            return self.extract_text(file_path)
        elif file_type in ["jpg", "jpeg", "png", "bmp", "gif"]:
            return self.extract_image_text(file_path)
        else:
            raise ValueError(f"Unsupported file type: .{file_type}")


# Example usage (for testing)
# if __name__ == "__main__":
#     processor = FileProcessor()
    
#     # Test with a text file
#     import tempfile
#     with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
#         f.write("This is a test document.\nWith multiple lines.\nFor testing extraction.")
#         temp_path = f.name
    
#     try:
#         text = processor.process_file(temp_path, "txt")
#         print(f"Extracted: {text[:100]}")
#     finally:
#         os.unlink(temp_path)
