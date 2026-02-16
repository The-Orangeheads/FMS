"""Download HF models referenced in app/services/embedding.py to local cache.

Usage:
  python scripts/download_models.py         # download all models
  python scripts/download_models.py --models sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  python scripts/download_models.py --cache-dir C:/my_cache --models BAAI/bge-m3

The script will attempt to install `huggingface-hub` automatically if missing.
"""
import os
import sys
import argparse
import subprocess
import re


def extract_model_registry_ids(path: str):
    text = open(path, 'r', encoding='utf-8').read()
    m = re.search(r'model_registry\s*=\s*\{', text)
    if not m:
        return {}
    start = m.end() - 1
    depth = 0
    end = start
    for i in range(start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                end = i
                break
    block = text[start:end+1]
    pattern = re.compile(r'"([^\"]+)"\s*:\s*\{(.*?)"id"\s*:\s*"([^\"]+)"', re.S)
    results = {}
    for m in pattern.finditer(block):
        key = m.group(1)
        hf_id = m.group(3)
        results[key] = hf_id
    return results


def ensure_package(pkg_name: str):
    try:
        __import__(pkg_name)
        return True
    except Exception:
        print(f"Package '{pkg_name}' not found; installing...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', pkg_name])
        try:
            __import__(pkg_name)
            return True
        except Exception as e:
            print(f"Failed to import {pkg_name} after install: {e}")
            return False


def download_model(hf_id: str, cache_dir: str = None, allow_patterns=None):
    from huggingface_hub import snapshot_download

    kwargs = {}
    if cache_dir:
        kwargs['cache_dir'] = cache_dir
    if allow_patterns:
        kwargs['allow_patterns'] = allow_patterns

    print(f"Downloading {hf_id} ...")
    path = snapshot_download(repo_id=hf_id, **kwargs)
    print(f"Downloaded {hf_id} -> {path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--models', nargs='+', help='One or more HF model ids to download')
    parser.add_argument('--cache-dir', help='Custom cache directory for huggingface hub')
    parser.add_argument('--embedding-file', default=os.path.join('app', 'services', 'embedding.py'), help='Path to embedding.py')
    args = parser.parse_args()

    embed_path = args.embedding_file
    if not os.path.exists(embed_path):
        print('embedding.py not found at', embed_path, file=sys.stderr)
        sys.exit(2)

    mapping = extract_model_registry_ids(embed_path)
    if not mapping:
        print('No models found in model_registry; exiting')
        sys.exit(1)

    # Determine targets (deduplicate while preserving order)
    if args.models:
        seen = {}
        targets = [m for m in args.models if not (m in seen or seen.setdefault(m, True))]
    else:
        # mapping.values() may include duplicates; remove duplicates
        seen = {}
        targets = [m for m in list(mapping.values()) if not (m in seen or seen.setdefault(m, True))]

    # Ensure huggingface_hub
    if not ensure_package('huggingface_hub'):
        print('huggingface_hub is required; aborting', file=sys.stderr)
        sys.exit(1)

    # Proceed to download each model
    for hf_id in targets:
        try:
            download_model(hf_id, cache_dir=args.cache_dir)
        except Exception as e:
            print(f"Failed to download {hf_id}: {e}")


if __name__ == '__main__':
    main()
