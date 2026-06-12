import io
import numpy as np
import torch
from PIL import Image
from app.core.config import settings
import easyocr

class OCR:
    def __init__(self):
        self.reader = easyocr.Reader(["en"], gpu=torch.cuda.is_available())

    def extract_text(self, image: bytes) -> str:
        try:
            img = Image.open(io.BytesIO(image)).convert("RGB")
        except Exception as e:
            print(f"Error loading image: {e}")
            return ""

        try:
            results = self.reader.readtext(np.array(img))
        except Exception as e:
            print(f"Error running OCR: {e}")
            return ""

        extracted_texts = [text for _, text, _ in results if text]
        res = " ".join(extracted_texts)

        if len(res) < settings.ocr_min_text_length:
            return ""
        
        return res
    