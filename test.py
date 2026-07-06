"""
Benchmark for the FMS project's HybridOCREngine -- the subprocess-isolated,
native PaddleOCR pipeline (LayoutDetection + bilingual EN/AR PaddleOCR).

Uses the same FUNSD dataset as the earlier rapidocr-paddle and
rapidocr+onnxruntime-gpu benchmarks in this conversation, for a direct,
apples-to-apples throughput/latency/VRAM comparison across all three
backends.

Key difference from those earlier scripts: OCR here runs inside a
*separate OS process* (spawned by HybridOCREngine), not in-process. So:
  - This script itself never imports paddle -- nothing to reorder against
    datasets/pyarrow.
  - RAM and VRAM are measured against the *worker* process (where the
    actual model weights and inference live), not this parent script.
  - Cold start includes subprocess spawn + model loading (layout + 2x
    PaddleOCR), which is expected to be slower than the in-process
    benchmarks' engine init.
"""

import csv
import io
import os
import sys
import time

import numpy as np
import psutil
from PIL import Image
from tqdm import tqdm

# =====================================================================
# Load dataset first, before touching the project's OCR modules -- cheap
# insurance carried over from the earlier benchmarks even though this
# parent process never imports paddle itself.
# =====================================================================
from datasets import load_dataset, concatenate_datasets

print("📦 Loading FUNSD form schemas...")
train_split = load_dataset("nielsr/funsd-layoutlmv3", split="train")
test_split = load_dataset("nielsr/funsd-layoutlmv3", split="test")
dataset_pool = concatenate_datasets([train_split, test_split])

# Make sure the project's `app` package is importable regardless of where
# this script is invoked from (mirrors running it from backend/).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

from app.core.hybrid_ocr_engine import HybridOCREngine

try:
    import pynvml
    pynvml.nvmlInit()
    NVML_AVAILABLE = True
except Exception:
    NVML_AVAILABLE = False

OUTPUT_CSV = "hybrid_ocr_fms_performance_focused.csv"


def get_gpu_vram_usage():
    """Device-wide VRAM usage via NVML (per-process unavailable under WDDM,
    confirmed earlier). Assumes nothing else is using the GPU during the run."""
    if not NVML_AVAILABLE:
        return 0.0
    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        return mem_info.used / (1024 * 1024)
    except Exception:
        return 0.0


def get_worker_ram_usage(worker_pid):
    """RAM of the actual OCR worker subprocess -- where the 3 loaded models
    (layout + EN + AR) live -- not this parent script's own footprint."""
    try:
        return psutil.Process(worker_pid).memory_info().rss / (1024 * 1024)
    except Exception:
        return 0.0


def pil_to_png_bytes(pil_img: Image.Image) -> bytes:
    buf = io.BytesIO()
    pil_img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


def print_performance_summary(cold_start_sec: float):
    if not os.path.exists(OUTPUT_CSV):
        print("❌ Error: Result log not found.")
        return

    latencies, vrams, rams = [], [], []
    total_samples = 0

    with open(OUTPUT_CSV, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["Type"] == "Warmup":
                continue
            total_samples += 1
            latencies.append(float(row["Latency_ms"]))
            vrams.append(float(row["VRAM_Used_MB"]))
            rams.append(float(row["RAM_Used_MB"]))

    if total_samples > 0:
        avg_latency_ms = np.mean(latencies)
        throughput_fps = 1000.0 / avg_latency_ms

        print("\n" + "="*80)
        print(" ⚡ HIGH-THROUGHPUT & VRAM HARDWARE PROFILE RESULTS (FMS HYBRID PADDLEOCR, SUBPROCESS-ISOLATED)")
        print("="*80)
        print(f"| Evaluation Parameter         | Value                 |")
        print(f"|------------------------------|-----------------------|")
        print(f"| Cold Start (spawn + models)  | {cold_start_sec:.2f} sec              |")
        print(f"| Steady-State Throughput      | {throughput_fps:.2f} Images/Sec     |")
        print(f"| Average Latency per Form     | {avg_latency_ms:.2f} ms             |")
        print(f"| Minimum Latency (Best Case)  | {np.min(latencies):.2f} ms             |")
        print(f"| Maximum Latency (Worst Case) | {np.max(latencies):.2f} ms             |")
        print(f"| Base Engine Initial VRAM     | {vrams[0]:.1f} MB            |")
        print(f"| Peak Hardware VRAM Reached   | {np.max(vrams):.1f} MB            |")
        print(f"| Worker Process RAM (Avg)     | {np.mean(rams):.1f} MB            |")
        print(f"| Worker Process RAM (Peak)    | {np.max(rams):.1f} MB            |")
        print(f"========================================================================\n")


if __name__ == "__main__":
    print("\n⏳ Spawning HybridOCREngine (layout + bilingual PaddleOCR, isolated subprocess)...")
    init_start = time.perf_counter()
    engine = HybridOCREngine()
    cold_start_sec = time.perf_counter() - init_start
    print(f"🚀 Engine ready in {cold_start_sec:.2f}s (worker pid={engine._proc.pid}).")

    worker_pid = engine._proc.pid

    try:
        print("🔥 Commencing hardware engine warmup loops (5 iterations)...")
        warmup_samples = dataset_pool.select(range(5))
        for sample in warmup_samples:
            img_bytes = pil_to_png_bytes(sample["image"])
            _ = engine.extract_text(img_bytes)

        with open(OUTPUT_CSV, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Sample_ID", "Type", "Latency_ms", "VRAM_Used_MB", "RAM_Used_MB"])

        print("🚀 Running benchmark iterations across steady-state pool...")

        for idx, sample in enumerate(tqdm(dataset_pool, desc="Processing Pipeline")):
            img_bytes = pil_to_png_bytes(sample["image"])

            start_time = time.perf_counter()
            _ = engine.extract_text(img_bytes)
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            current_vram = get_gpu_vram_usage()
            current_ram = get_worker_ram_usage(worker_pid)

            with open(OUTPUT_CSV, mode="a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([idx, "Benchmark", round(elapsed_ms, 2), round(current_vram, 2), round(current_ram, 2)])

        print("\n🎉 Runs successfully finalized.")
        print_performance_summary(cold_start_sec)

    finally:
        print("🧹 Shutting down OCR worker subprocess...")
        engine.close()