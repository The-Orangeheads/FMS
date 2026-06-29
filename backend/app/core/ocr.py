import io
import numpy as np
import torch
from PIL import Image
from app.core.config import settings
import easyocr

class OCR:
    def __init__(self):
        self.reader = easyocr.Reader(["en", "ar"], gpu=torch.cuda.is_available())

    def extract_text(self, image: bytes) -> str:
        try:
            img = Image.open(io.BytesIO(image)).convert("RGB")
        except Exception as e:
            raise Exception(f"Error loading image: {e}")
        
        try:
            results = self.reader.readtext(np.array(img))
        except Exception as e:
            raise Exception(f"Error running OCR: {e}")
        
        extracted_texts = [text for _, text, _ in results if text]
        res = " ".join(extracted_texts)
        
        return res
    