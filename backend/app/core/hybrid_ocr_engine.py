"""
Layout-aware OCR for FMS text ingestion.

Routes each image through RapidLayout (CDLA) when document geometry is detected,
then runs RapidOCR on cropped regions sequentially to preserve reading order.
Falls back to full-image RapidOCR for scene text (receipts, signs, photos).
"""

import io
import logging
import re
from typing import Any, List

import numpy as np
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)

SKIP_LAYOUT_LABELS = frozenset({"header", "footer"})
_ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
_LATIN_RE = re.compile(r"[A-Za-z]")


def _merge_bilingual(en_text: str, ar_text: str) -> str:
    en_text = en_text.strip()
    ar_text = ar_text.strip()

    if not en_text and not ar_text:
        return ""
    if en_text == ar_text:
        return en_text

    parts: List[str] = []
    if en_text and (_LATIN_RE.search(en_text) or not _ARABIC_RE.search(en_text)):
        parts.append(en_text)
    if ar_text and _ARABIC_RE.search(ar_text):
        parts.append(ar_text)

    if not parts:
        return en_text or ar_text
    return " ".join(parts)


def _build_rapidocr(lang_rec):
    from rapidocr import LangDet, LangRec, ModelType, OCRVersion, RapidOCR

    return RapidOCR(
        params={
            "Det.lang_type": LangDet.MULTI,
            "Det.model_type": ModelType.MOBILE,
            "Det.ocr_version": OCRVersion.PPOCRV4,
            "Rec.lang_type": lang_rec,
            "Rec.model_type": ModelType.MOBILE,
            "Rec.ocr_version": OCRVersion.PPOCRV5,
        }
    )


def _parse_ocr_result(ocr_result: Any) -> str:
    if ocr_result is None:
        return ""

    if hasattr(ocr_result, "txts") and ocr_result.txts:
        return " ".join(ocr_result.txts)

    if isinstance(ocr_result, tuple) and len(ocr_result) >= 1:
        res_list = ocr_result[0]
        if isinstance(res_list, list):
            return " ".join(str(line[1]) for line in res_list if len(line) > 1)

    if isinstance(ocr_result, list) and ocr_result:
        return " ".join(str(line[1]) for line in ocr_result if len(line) > 1)

    return ""


def _parse_layout_blocks(layout_out: Any) -> List[dict]:
    if layout_out is None:
        return []

    blocks: List[dict] = []

    if hasattr(layout_out, "boxes"):
        categories = getattr(
            layout_out, "class_names", getattr(layout_out, "labels", None)
        )
        if categories is not None:
            for box, cat in zip(layout_out.boxes, categories):
                blocks.append({"bbox": box, "label": str(cat).lower()})
    elif isinstance(layout_out, tuple) and len(layout_out) >= 3:
        for box, cat in zip(layout_out[0], layout_out[2]):
            blocks.append({"bbox": box, "label": str(cat).lower()})

    return blocks


class HybridOCREngine:
    def __init__(self):
        logging.getLogger("RapidOCR").setLevel(logging.ERROR)

        from rapid_layout import RapidLayout
        from rapidocr import LangRec

        logger.info("Loading Hybrid OCR (RapidLayout + EN/AR RapidOCR ONNX)...")
        self.layout_engine = RapidLayout()
        self.en_engine = _build_rapidocr(LangRec.EN)
        self.ar_engine = _build_rapidocr(LangRec.ARABIC)
        logger.info("Hybrid OCR ready (English + Arabic PP-OCRv5).")

    def extract_text(self, image: bytes) -> str:
        try:
            pil_img = Image.open(io.BytesIO(image)).convert("RGB")
        except Exception as e:
            raise Exception(f"Error loading image: {e}") from e

        try:
            return self._extract_from_pil(pil_img)
        except Exception as e:
            raise Exception(f"Error running OCR: {e}") from e

    def _extract_from_pil(self, pil_img: Image.Image) -> str:
        img_np = np.array(pil_img)

        try:
            layout_out = self.layout_engine(img_np)
        except Exception:
            layout_out = None

        layout_blocks = _parse_layout_blocks(layout_out)

        if not layout_blocks:
            return self._ocr_image(img_np)

        return self._ocr_layout_blocks(img_np, layout_blocks)

    def _ocr_image(self, img_np: np.ndarray) -> str:
        en_text = _parse_ocr_result(self.en_engine(img_np))
        ar_text = _parse_ocr_result(self.ar_engine(img_np))
        return _merge_bilingual(en_text, ar_text)

    def _ocr_layout_blocks(self, img_np: np.ndarray, layout_blocks: List[dict]) -> str:
        h, w, _ = img_np.shape
        pad = settings.ocr_crop_padding

        extracted_chunks: List[str] = []

        for block in layout_blocks:
            bbox = block.get("bbox")
            label = block.get("label", "text")

            if bbox is None or label in SKIP_LAYOUT_LABELS:
                continue

            x1 = max(0, int(bbox[0]) - pad)
            y1 = max(0, int(bbox[1]) - pad)
            x2 = min(w, int(bbox[2]) + pad)
            y2 = min(h, int(bbox[3]) + pad)

            if x2 <= x1 or y2 <= y1:
                continue

            cropped = img_np[y1:y2, x1:x2]
            text = self._ocr_image(cropped)
            
            if text:
                extracted_chunks.append(text)

        return "\n\n".join(extracted_chunks)