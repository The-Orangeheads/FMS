"""Check local cache status for models referenced by EmbeddingService.

Run: py -3 scripts/check_model_cache.py
"""
import sys
from app.services.embedding import EmbeddingService


def main():
    svc = EmbeddingService()
    for key, cfg in svc.model_registry.items():
        hf_id = cfg["id"]
        checks = []
        # Try transformers AutoModel (local only)
        try:
            from transformers import AutoModel
            AutoModel.from_pretrained(hf_id, local_files_only=True)
            print(f"{key}: cached (AutoModel)")
            continue
        except Exception as e:
            checks.append(f"AutoModel:{e}")

        # Try huggingface_hub snapshot_download
        try:
            from huggingface_hub import snapshot_download
            snapshot_download(hf_id, local_files_only=True)
            print(f"{key}: cached (snapshot_download)")
            continue
        except Exception as e:
            checks.append(f"snapshot_download:{e}")

        print(f"{key}: NOT cached -> {' | '.join(checks)}")


if __name__ == '__main__':
    main()
