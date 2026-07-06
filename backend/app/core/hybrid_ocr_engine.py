"""
Client-side proxy for the isolated PaddleOCR worker process.

Public interface unchanged from the previous ONNX-based HybridOCREngine:
    engine = HybridOCREngine()
    text = engine.extract_text(image_bytes)

Internally, this spawns app/core/ocr_worker.py as a separate OS process
(subprocess.Popen -- NOT multiprocessing.Process, to avoid Windows'
spawn-based re-import of __main__) and talks to it over a local
multiprocessing.connection socket. This keeps PaddlePaddle's CUDA/cuDNN
runtime fully isolated from PyTorch's, which the main app loads directly
elsewhere (see app/api/vector_db_controller.py) -- the two collide if
loaded into the same process on Windows.
"""

import logging
import secrets
import subprocess
import sys
import threading
import time
from multiprocessing.connection import Client
from pathlib import Path

logger = logging.getLogger(__name__)

_WORKER_SCRIPT = Path(__file__).parent / "ocr_worker.py"
# Generous timeout: first run in a fresh venv/cache can involve downloading
# several ONNX models (layout + multilingual det + EN rec + AR rec), which
# can easily exceed 2 minutes on a slow connection. Subsequent runs with
# models already cached should be much faster (seconds, not minutes).
_STARTUP_TIMEOUT_SEC = 600
_REQUEST_TIMEOUT_SEC = 60


class HybridOCREngine:
    def __init__(self, port: int = 0, backend: str = "rapidocr"):
        """backend: 'rapidocr' (RapidLayout + bilingual RapidOCR, ONNX GPU)
        or 'paddle' (native LayoutDetection + bilingual PaddleOCR, GPU)."""
        self._authkey = secrets.token_hex(16)
        self._port = port or 8765
        self._address = ("127.0.0.1", self._port)
        self._backend = backend

        logger.info("Spawning isolated OCR worker process (backend=%s)...", backend)
        self._proc = subprocess.Popen(
            [sys.executable, "-u", str(_WORKER_SCRIPT), str(self._port), self._authkey, backend],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        self._output_lines = []
        self._output_thread = threading.Thread(
            target=self._stream_worker_output, daemon=True
        )
        self._output_thread.start()

        self._conn = self._connect_with_retry()
        self._handshake()
        logger.info("PaddleOCR worker ready (pid=%s).", self._proc.pid)

    def _stream_worker_output(self):
        """Runs in a background thread for the process lifetime, forwarding
        the worker's stdout/stderr to this process's logger in real time
        (instead of only being visible after the process exits)."""
        if not self._proc.stdout:
            return
        for line in self._proc.stdout:
            line = line.rstrip("\n")
            self._output_lines.append(line)
            print(f"[ocr_worker pid={self._proc.pid}] {line}", flush=True)

    def _connect_with_retry(self):
        deadline = time.monotonic() + _STARTUP_TIMEOUT_SEC
        last_err = None

        while time.monotonic() < deadline:
            if self._proc.poll() is not None:
                # Worker died during startup -- surface its buffered output
                # (can't re-read stdout here, it's already being consumed by
                # the streaming thread).
                output = "\n".join(self._output_lines)
                raise RuntimeError(
                    f"OCR worker process exited early (code {self._proc.returncode}).\n"
                    f"Worker output:\n{output}"
                )
            try:
                return Client(self._address, authkey=self._authkey.encode("utf-8"))
            except (ConnectionRefusedError, OSError) as e:
                last_err = e
                time.sleep(0.5)

        raise TimeoutError(
            f"OCR worker did not become ready within {_STARTUP_TIMEOUT_SEC}s.\n"
            f"Worker output so far:\n" + "\n".join(self._output_lines)
        ) from last_err

    def _handshake(self):
        self._conn.send(("ping", None))
        status, payload = self._conn.recv()
        if status != "ok" or not isinstance(payload, dict) or not payload.get("pong"):
            raise RuntimeError(f"Unexpected handshake response: {status!r}, {payload!r}")

        # Trust the worker's own reported PID over subprocess.Popen's PID --
        # on this machine psutil.Process(self._proc.pid) was found to point
        # at a near-empty process, not the one actually holding the loaded
        # models. Getting the PID from the process itself sidesteps whatever
        # Windows-specific process-tracking quirk causes that mismatch.
        self.worker_pid = payload.get("pid", self._proc.pid)

    def extract_text(self, image: bytes) -> str:
        try:
            self._conn.send(("extract", image))
            status, payload = self._conn.recv()
        except (EOFError, BrokenPipeError, ConnectionResetError) as e:
            raise RuntimeError("Lost connection to OCR worker process") from e

        if status == "error":
            raise Exception(f"Error running OCR: {payload}")
        return payload

    def close(self):
        try:
            self._conn.send(("shutdown", None))
            self._conn.recv()
        except Exception:
            pass
        finally:
            try:
                self._conn.close()
            except Exception:
                pass
            if self._proc.poll() is None:
                self._proc.terminate()
                try:
                    self._proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self._proc.kill()

    def __del__(self):
        self.close()