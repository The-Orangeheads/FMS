"""
Isolated OCR worker process.

Runs the ONNX-based RapidLayout + bilingual RapidOCR (EN/AR) pipeline in a
separate OS process. Kept subprocess-isolated even though this backend
doesn't use paddle (so no paddle/torch DLL collision risk) -- cheap
insurance, and keeps the same architecture/protocol regardless of which
OCR backend is swapped in underneath.

Communicates with the parent process over a local multiprocessing
Listener/Client socket. Protocol:
    request:  ("extract", image_bytes: bytes)
    response: ("ok", text: str)  |  ("error", message: str)
    request:  ("ping", None) -> ("ok", {"pong": True, "pid": <worker pid>})
"""

import io
import logging
import os
import sys

# Force PaddlePaddle to allocate VRAM on-demand instead of hogging 50%+ up front
os.environ["FLAGS_allocator_strategy"] = "auto_growth"
# Actively release intermediate execution tensors to keep peak VRAM as low as possible
os.environ["FLAGS_eager_delete_scope"] = "True"
# Disable background connectivity checks to speed up startup times
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
import re
import sys
from multiprocessing.connection import Listener
from typing import Any, List

logging.basicConfig(level=logging.INFO, format="[ocr_worker] %(message)s")
logger = logging.getLogger("ocr_worker")


# --- Windows Dynamic Linker Patch for CUDA ---
# Pip-installed nvidia-cublas-cu12/nvidia-cudnn-cu12 etc. (pulled in by
# onnxruntime-gpu) put their DLLs in a location Windows doesn't search by
# default. Without this, GPU init can fail with "WinError 127 ... DLL not
# found" -- same class of issue we hit and fixed with paddle earlier.
def bootstrap_windows_cuda():
    if sys.platform == "win32":
        for path in sys.path:
            nvidia_dir = os.path.join(path, "nvidia")
            if os.path.isdir(nvidia_dir):
                for root, dirs, files in os.walk(nvidia_dir):
                    if "bin" in dirs:
                        bin_path = os.path.abspath(os.path.join(root, "bin"))
                        try:
                            os.add_dll_directory(bin_path)
                            os.environ["PATH"] = bin_path + os.path.pathsep + os.environ["PATH"]
                        except Exception:
                            pass


bootstrap_windows_cuda()

import numpy as np
from PIL import Image

SKIP_LAYOUT_LABELS = frozenset({"header", "footer"})
_ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
_LATIN_RE = re.compile(r"[A-Za-z]")

# Padding added around each cropped layout region before OCR, in pixels.
CROP_PADDING = 10


def _merge_bilingual(en_text: str, ar_text: str) -> str:
    en_text = (en_text or "").strip()
    ar_text = (ar_text or "").strip()

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


class _RapidEngines:
    """RapidLayout (CDLA) + bilingual RapidOCR (EN/AR), ONNX Runtime GPU.

    Logic unchanged from the originally supplied HybridOCREngine -- the only
    addition is the explicit EngineConfig.onnxruntime.use_cuda/gpu_id flags,
    since without them this backend silently runs on CPU (confirmed twice),
    which would make any VRAM/speed comparison meaningless.
    """

    def __init__(self):
        logging.getLogger("RapidOCR").setLevel(logging.ERROR)

        from rapid_layout import RapidLayout
        from rapidocr import LangDet, LangRec, ModelType, OCRVersion, RapidOCR

        def build_rapidocr(lang_rec):
            return RapidOCR(
                params={
                    "Det.lang_type": LangDet.MULTI,
                    "Det.model_type": ModelType.MOBILE,
                    "Det.ocr_version": OCRVersion.PPOCRV4,
                    "Rec.lang_type": lang_rec,
                    "Rec.model_type": ModelType.MOBILE,
                    "Rec.ocr_version": OCRVersion.PPOCRV5,
                    "EngineConfig.onnxruntime.use_cuda": True,
                    "EngineConfig.onnxruntime.gpu_id": 0,
                }
            )

        logger.info("Loading RapidLayout (CDLA)...")
        self.layout_engine = RapidLayout()

        logger.info("Loading RapidOCR English recognizer (ONNX, GPU)...")
        self.en_engine = build_rapidocr(LangRec.EN)

        logger.info("Loading RapidOCR Arabic recognizer (ONNX, GPU)...")
        self.ar_engine = build_rapidocr(LangRec.ARABIC)

        logger.info("All engines loaded and ready.")

    def _parse_ocr_result(self, ocr_result) -> str:
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

    def _parse_layout_blocks(self, layout_out) -> List[dict]:
        if layout_out is None:
            return []
        blocks: List[dict] = []
        if hasattr(layout_out, "boxes"):
            categories = getattr(layout_out, "class_names", getattr(layout_out, "labels", None))
            if categories is not None:
                for box, cat in zip(layout_out.boxes, categories):
                    blocks.append({"bbox": box, "label": str(cat).lower()})
        elif isinstance(layout_out, tuple) and len(layout_out) >= 3:
            for box, cat in zip(layout_out[0], layout_out[2]):
                blocks.append({"bbox": box, "label": str(cat).lower()})
        return blocks

    def _ocr_region(self, img_np: np.ndarray) -> str:
        en_text = self._parse_ocr_result(self.en_engine(img_np))
        ar_text = self._parse_ocr_result(self.ar_engine(img_np))
        return _merge_bilingual(en_text, ar_text)

    def extract_text(self, image_bytes: bytes) -> str:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(pil_img)

        try:
            layout_out = self.layout_engine(img_np)
        except Exception:
            logger.exception("Layout detection failed; falling back to full-image OCR")
            layout_out = None

        blocks = self._parse_layout_blocks(layout_out)

        if not blocks:
            return self._ocr_region(img_np)

        h, w = img_np.shape[:2]
        chunks: List[str] = []

        for block in blocks:
            if block["label"] in SKIP_LAYOUT_LABELS:
                continue

            x1, y1, x2, y2 = block["bbox"]
            x1 = max(0, int(x1) - CROP_PADDING)
            y1 = max(0, int(y1) - CROP_PADDING)
            x2 = min(w, int(x2) + CROP_PADDING)
            y2 = min(h, int(y2) + CROP_PADDING)

            if x2 <= x1 or y2 <= y1:
                continue

            cropped = img_np[y1:y2, x1:x2]
            text = self._ocr_region(cropped)
            if text:
                chunks.append(text)

        return "\n\n".join(chunks)


class _PaddleEngines:
    """Native PaddleOCR: Optimized standalone LayoutDetection + Unified Bilingual PaddleOCR.
    
    Consolidates EN/AR processing into a single multilingual engine to eliminate 
    the dual-engine penalty and maximize desktop processing throughput.
    """

    def __init__(self):
        logging.getLogger("ppocr").setLevel(logging.ERROR)
        logging.getLogger("paddlex").setLevel(logging.ERROR)

        # Block paddlex's transitive module loading conflict
        import types as _types
        if "modelscope" not in sys.modules:
            _stub = _types.ModuleType("modelscope")
            _stub.__version__ = "0.0.0-stubbed"
            sys.modules["modelscope"] = _stub

        from paddleocr import LayoutDetection, PaddleOCR

        # Change the log message and the model_name string here:
        logger.info("Loading LayoutDetection (PP-DocLayout-L, GPU)...")
        self.layout_engine = LayoutDetection(model_name="PP-DocLayout-L", device="gpu:0")
        
        logger.info("Loading Unified Bilingual PaddleOCR Engine (Arabic + English, GPU)...")
        # Optimization: The Arabic model inherently recognizes standard English alphanumeric 
        # characters out of the box, eliminating the need to maintain an independent English instance.
        self.ocr_engine = PaddleOCR(
            lang="ar",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device="gpu:0",
        )

        logger.info("All optimized engines loaded and ready.")

    def _parse_ocr_texts(self, ocr_result) -> str:
        # Normalize single results into an iterable list
        results_list = ocr_result if isinstance(ocr_result, list) else [ocr_result]
        
        texts: List[str] = []
        for res in results_list:
            data = res.json.get("res", {}) if hasattr(res, "json") else {}
            rec_texts = data.get("rec_texts", [])
            texts.extend(str(t) for t in rec_texts if t)
        return " ".join(texts)

    def _get_box_label(self, box: dict) -> str:
        for key in ("label_name", "label", "cls_name", "category_name"):
            if key in box:
                return str(box[key]).lower()
        return "text"

    def _parse_layout_boxes(self, layout_result) -> List[dict]:
        blocks: List[dict] = []
        for res in layout_result:
            data = res.json.get("res", {}) if hasattr(res, "json") else {}
            for box in data.get("boxes", []):
                coordinate = box.get("coordinate")
                if coordinate is None:
                    continue
                blocks.append({"bbox": coordinate, "label": self._get_box_label(box)})
        return blocks

    def extract_text(self, image_bytes: bytes) -> str:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(pil_img)

        try:
            layout_result = list(self.layout_engine.predict(img_np, batch_size=1))
        except Exception:
            logger.exception("Layout detection failed; falling back to full-image OCR")
            layout_result = None

        blocks = self._parse_layout_boxes(layout_result) if layout_result else []

        # Fallback if no layout structures are detected
        if not blocks:
            res = self.ocr_engine.predict(img_np)
            return self._parse_ocr_texts(res)

        h, w = img_np.shape[:2]
        chunks: List[str] = []

        # Iterate over the layout blocks using the single unified engine
        for block in blocks:
            if block["label"] in SKIP_LAYOUT_LABELS:
                continue

            x1, y1, x2, y2 = block["bbox"]
            x1 = max(0, int(x1) - CROP_PADDING)
            y1 = max(0, int(y1) - CROP_PADDING)
            x2 = min(w, int(x2) + CROP_PADDING)
            y2 = min(h, int(y2) + CROP_PADDING)

            if x2 <= x1 or y2 <= y1:
                continue

            crop = img_np[y1:y2, x1:x2]
            
            # Execute inference via the single bilingual engine
            res = self.ocr_engine.predict(crop)
            text = self._parse_ocr_texts(res)
            
            if text.strip():
                chunks.append(text)

        # Reconstruct the flat text stream separated by double newlines for the Vector DB
        return "\n\n".join(chunks)
_BACKENDS = {
    "rapidocr": _RapidEngines,
    "paddle": _PaddleEngines,
}


def serve(address: tuple, authkey: bytes, backend: str) -> None:
    engines = _BACKENDS[backend]()

    listener = Listener(address, authkey=authkey)
    logger.info(f"Listening on {address} -- ready for requests.")

    try:
        while True:
            conn = listener.accept()
            try:
                while True:
                    try:
                        msg = conn.recv()
                    except EOFError:
                        break

                    if msg is None:
                        continue

                    cmd, payload = msg

                    if cmd == "ping":
                        conn.send(("ok", {"pong": True, "pid": os.getpid()}))
                        continue

                    if cmd == "shutdown":
                        conn.send(("ok", "shutting down"))
                        return

                    if cmd == "extract":
                        try:
                            text = engines.extract_text(payload)
                            conn.send(("ok", text))
                        except Exception as e:
                            logger.exception("extract_text failed")
                            conn.send(("error", str(e)))
                        continue

                    conn.send(("error", f"unknown command: {cmd}"))
            finally:
                conn.close()
    finally:
        listener.close()


if __name__ == "__main__":
    # Usage: python ocr_worker.py <port> <authkey> <backend: rapidocr|paddle>
    if len(sys.argv) != 4 or sys.argv[3] not in _BACKENDS:
        print(f"Usage: python ocr_worker.py <port> <authkey> <backend: {'|'.join(_BACKENDS)}>", file=sys.stderr)
        sys.exit(1)

    port = int(sys.argv[1])
    authkey = sys.argv[2].encode("utf-8")
    backend = sys.argv[3]
    serve(("127.0.0.1", port), authkey, backend)