"""
app/core/ocr_service.py
-----------------------
OCR service with three selectable backends.

Backend options (set via settings.ocr_backend):

  "parseq"   — PARSeq (Bautista & Atienza, ECCV 2022 / arXiv:2207.06966)
               + DBNet detector (Liao et al., AAAI 2020)
               Best accuracy on both scene text and scanned documents.
               ~300 MB VRAM during inference, ~250 MB RAM when offloaded.
               Requires: pip install torch torchvision mmocr

  "paddle"   — PaddleOCR PP-OCR (Du et al., arXiv:2009.09941)
               Integrated detection + recognition in a single call.
               Good accuracy, simplest integration path.
               ~500 MB VRAM during inference.
               Requires: pip install "paddleocr==2.8.1" "paddlepaddle==2.6.2"

  "tesseract" — Tesseract v4 (Smith, ICDAR 2007) via pytesseract subprocess.
               Zero Python memory footprint — runs as an external process.
               Best for dense multi-line scanned pages.
               Requires: pip install pytesseract
                         + Tesseract binary: https://github.com/UB-Mannheim/tesseract/wiki

All backends expose the same interface:
    ocr_service.extract_text(image_bytes: bytes) -> str
    ocr_service.free_vram()

VRAM behaviour mirrors your existing embedding models:
    - Loads to VRAM on first extract_text() call
    - free_vram() moves model back to CPU and clears CUDA cache
    - free_vram() is a no-op if keep_models_in_memory=True or device is CPU
"""

from __future__ import annotations

import logging
import threading
from typing import Optional

import torch

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Base interface — mirrors EmbeddingModelInterface pattern in embedding.py
# ---------------------------------------------------------------------------

class OCRBackendInterface:
    def extract_text(self, image_bytes: bytes) -> str:
        raise NotImplementedError

    def free_vram(self):
        raise NotImplementedError

    def load_on_vram(self):
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Backend 1 — PARSeq + DBNet
# Citation: PARSeq — Bautista & Atienza, ECCV 2022
#           DBNet  — Liao et al., AAAI 2020
# ---------------------------------------------------------------------------

class PARSeqOCRBackend(OCRBackendInterface):
    """
    Two-stage pipeline:
        DBNet  → detects word bounding boxes on the full image
        PARSeq → recognises each cropped word region

    Memory profile:
        VRAM during inference : ~300 MB (DBNet ~80 MB + PARSeq ~220 MB)
        RAM when offloaded    : ~250 MB
        Spike duration        : only during extract_text() call
    """

    IMG_H, IMG_W = 32, 128   # PARSeq canonical input size

    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.vram_lock = threading.Lock()
        self.on_vram = False
        self._parseq = None
        self._dbnet = None
        self._transform = None
        self._load_models()

    def _load_models(self):
        import torchvision.transforms as T
        import subprocess, sys

        # Ensure dependencies are present
        for dep in ["pytorch_lightning", "nltk", "timm"]:
            try:
                __import__(dep)
            except ImportError:
                logger.info(f"[ocr/parseq] Installing {dep} ...")
                subprocess.check_call([sys.executable, "-m", "pip", "install", dep, "-q"])

        logger.info("[ocr/parseq] Loading PARSeq from torch.hub ...")
        self._parseq = torch.hub.load(
            "baudm/parseq", "parseq",
            pretrained=True,
            trust_repo=True,
        ).to("cpu").eval()

        logger.info("[ocr/parseq] Loading DBNet from MMOCR ...")
        try:
            from mmocr.apis import MMOCRInferencer
            # det_only=True — we only need bounding boxes, not recognition
            self._dbnet = MMOCRInferencer(det="DBNet", device="cpu")
        except ImportError:
            logger.warning(
                "[ocr/parseq] MMOCR not installed — falling back to full-image crop. "
                "Install with: pip install mmocr"
            )
            self._dbnet = None

        self._transform = T.Compose([
            T.Resize((self.IMG_H, self.IMG_W),
                     interpolation=T.InterpolationMode.BICUBIC),
            T.ToTensor(),
            T.Normalize(mean=0.5, std=0.5),
        ])

        if settings.keep_models_in_memory and self.device == "cuda":
            self._move_to("cuda")

    def _move_to(self, device: str):
        self._parseq = self._parseq.to(device)
        if self._dbnet is not None:
            # MMOCRInferencer handles its own device internally
            pass
        self.on_vram = (device == "cuda")
        logger.info(f"[ocr/parseq] Models on device: {device}")

    def load_on_vram(self):
        if self.device != "cuda":
            return
        with self.vram_lock:
            if self.on_vram:
                return
            self._move_to("cuda")

    def free_vram(self):
        if self.device != "cuda" or settings.keep_models_in_memory:
            return
        with self.vram_lock:
            if not self.on_vram:
                return
            self._move_to("cpu")
            torch.cuda.empty_cache()
            logger.info("[ocr/parseq] VRAM freed.")

    def _detect_regions(self, pil_image) -> list:
        """
        Run DBNet to get word-level bounding boxes.
        Returns list of (x0, y0, x1, y1) pixel tuples.
        Falls back to the full image as a single region if DBNet unavailable.
        """
        if self._dbnet is None:
            w, h = pil_image.size
            return [(0, 0, w, h)]

        import numpy as np
        result = self._dbnet(pil_image, return_vis=False)
        boxes = []
        try:
            preds = result["predictions"][0]["det_polygons"]
            for poly in preds:
                # poly is [x0,y0, x1,y0, x1,y1, x0,y1] — take bounding rect
                xs = poly[0::2]
                ys = poly[1::2]
                boxes.append((int(min(xs)), int(min(ys)),
                              int(max(xs)), int(max(ys))))
        except (KeyError, IndexError):
            w, h = pil_image.size
            boxes = [(0, 0, w, h)]
        return boxes

    def _recognise_crops(self, pil_image, boxes: list) -> list[str]:
        """Run PARSeq on each cropped region."""
        if not boxes:
            return []

        crops = []
        for (x0, y0, x1, y1) in boxes:
            # guard against degenerate boxes
            if x1 - x0 < 4 or y1 - y0 < 4:
                continue
            crop = pil_image.crop((x0, y0, x1, y1)).convert("RGB")
            crops.append(self._transform(crop))

        if not crops:
            return []

        tensor = torch.stack(crops).to(self.device)
        with torch.no_grad():
            logits = self._parseq(tensor)
        preds, _ = self._parseq.tokenizer.decode(logits.softmax(-1))
        return [p.strip() for p in preds]

    def extract_text(self, image_bytes: bytes) -> str:
        from PIL import Image
        import io

        self.load_on_vram()

        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        boxes = self._detect_regions(pil_image)
        words = self._recognise_crops(pil_image, boxes)

        # join words preserving rough reading order (boxes already top-to-bottom)
        text = " ".join(w for w in words if w)
        logger.debug(f"[ocr/parseq] Extracted {len(words)} words → {len(text)} chars")
        return text


# ---------------------------------------------------------------------------
# Backend 2 — PaddleOCR PP-OCR
# Citation: Du et al., arXiv:2009.09941
# ---------------------------------------------------------------------------

class PaddleOCRBackend(OCRBackendInterface):
    """
    Integrated detection + recognition in a single library call.
    Simpler than PARSeq+DBNet; slightly lower accuracy (83.9% vs 87.9% on IIIT5K).

    Memory profile:
        VRAM during inference : ~500 MB
        RAM when offloaded    : ~400 MB

    Windows note: pin to paddleocr==2.8.1 + paddlepaddle==2.6.2
    to avoid the modelscope/shm.dll conflict with PyTorch.
    """

    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.vram_lock = threading.Lock()
        self.on_vram = False
        self._ocr = None
        self._load_model()

    def _check_version(self):
        try:
            import paddleocr
            ver = getattr(paddleocr, "__version__", "unknown")
            major = int(ver.split(".")[0]) if ver[0].isdigit() else 3
            if major >= 3:
                raise RuntimeError(
                    f"paddleocr {ver} conflicts with PyTorch on Windows. "
                    "Fix: pip install 'paddleocr==2.8.1' 'paddlepaddle==2.6.2'"
                )
        except ImportError:
            raise RuntimeError(
                "paddleocr not installed. "
                "Fix: pip install 'paddleocr==2.8.1' 'paddlepaddle==2.6.2'"
            )

    def _load_model(self):
        self._check_version()
        from paddleocr import PaddleOCR
        import paddle

        use_gpu = (
            self.device == "cuda"
            and paddle.is_compiled_with_cuda()
            and paddle.device.cuda.device_count() > 0
        )
        logger.info(f"[ocr/paddle] Loading PaddleOCR (use_gpu={use_gpu}) ...")
        self._ocr = PaddleOCR(
            use_angle_cls=False,
            lang="en",
            use_gpu=use_gpu if settings.keep_models_in_memory else False,
            det=True,
            rec=True,
            show_log=False,
        )
        self.on_vram = use_gpu and settings.keep_models_in_memory

    def load_on_vram(self):
        # PaddleOCR manages its own device — nothing to do here
        pass

    def free_vram(self):
        # PaddleOCR does not expose a clean VRAM free — mark as offloaded
        # and rely on paddle's own memory management
        if settings.keep_models_in_memory:
            return
        import paddle
        paddle.device.cuda.empty_cache()
        self.on_vram = False
        logger.info("[ocr/paddle] VRAM cache cleared.")

    def extract_text(self, image_bytes: bytes) -> str:
        import numpy as np
        from PIL import Image
        import io

        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(pil)

        result = self._ocr.ocr(img_np, det=True, cls=False)
        if not result or not result[0]:
            return ""

        lines = []
        for line in result[0]:
            text, _conf = line[1]
            if text.strip():
                lines.append(text.strip())

        text = " ".join(lines)
        logger.debug(f"[ocr/paddle] Extracted {len(lines)} lines → {len(text)} chars")
        return text


# ---------------------------------------------------------------------------
# Backend 3 — Tesseract v4
# Citation: Smith, ICDAR 2007
# ---------------------------------------------------------------------------

class TesseractOCRBackend(OCRBackendInterface):
    """
    Runs Tesseract as a subprocess via pytesseract.
    Zero Python heap footprint — the binary handles everything externally.
    Best for dense multi-line printed text on full scanned pages.
    Weakest on logos, irregular fonts, and low-resolution figure labels.

    Memory profile:
        VRAM : 0 MB (subprocess, not GPU)
        RAM  : ~0 MB additional Python heap
    """

    def __init__(self):
        self.device = "cpu"   # always CPU
        try:
            import pytesseract
            # Smoke-test that the binary is accessible
            pytesseract.get_tesseract_version()
            logger.info("[ocr/tesseract] Tesseract binary found.")
        except Exception as e:
            raise RuntimeError(
                f"Tesseract not accessible: {e}. "
                "Install the binary from https://github.com/UB-Mannheim/tesseract/wiki "
                "and pip install pytesseract"
            )

    def load_on_vram(self):
        pass  # subprocess, nothing to load

    def free_vram(self):
        pass  # subprocess, nothing to free

    def extract_text(self, image_bytes: bytes) -> str:
        import pytesseract
        from PIL import Image
        import io

        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        # PSM 3 = fully automatic page segmentation (default)
        # OEM 1 = LSTM engine only
        config = "--oem 1 --psm 3"
        text = pytesseract.image_to_string(pil, config=config)
        text = " ".join(text.split())  # normalise whitespace
        logger.debug(f"[ocr/tesseract] Extracted {len(text)} chars")
        return text


# ---------------------------------------------------------------------------
# Factory — selects backend from settings.ocr_backend
# ---------------------------------------------------------------------------

class OCRService:
    """
    Singleton wrapper. Backend is lazily instantiated on first use
    so that import of this module never triggers model downloads.
    """

    def __init__(self):
        self._backend: Optional[OCRBackendInterface] = None
        self._init_lock = threading.Lock()

    def _get_backend(self) -> OCRBackendInterface:
        if self._backend is not None:
            return self._backend
        with self._init_lock:
            if self._backend is not None:
                return self._backend
            backend_name = getattr(settings, "ocr_backend", "parseq")
            logger.info(f"[ocr] Initialising backend: {backend_name}")
            if backend_name == "parseq":
                self._backend = PARSeqOCRBackend()
            elif backend_name == "paddle":
                self._backend = PaddleOCRBackend()
            elif backend_name == "tesseract":
                self._backend = TesseractOCRBackend()
            else:
                raise ValueError(
                    f"Unknown ocr_backend '{backend_name}'. "
                    "Choose: 'parseq', 'paddle', 'tesseract'"
                )
        return self._backend

    def extract_text(self, image_bytes: bytes) -> str:
        """
        Extract text from raw image bytes.
        Returns empty string if no meaningful text found.
        """
        if not getattr(settings, "enable_ocr", True):
            return ""
        return self._get_backend().extract_text(image_bytes)

    def free_vram(self):
        """
        Offload the OCR model from VRAM to CPU.
        Safe to call even if the backend was never initialised.
        """
        if self._backend is not None:
            self._backend.free_vram()


# Global singleton — import this everywhere
ocr = OCRService()