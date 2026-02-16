"""Check local cache for HF model IDs by parsing app/services/embedding.py
This script avoids importing project modules (no pydantic dependency).
"""
import os
import re
import sys


def extract_model_registry_ids(path: str):
    text = open(path, 'r', encoding='utf-8').read()
    # Locate the model_registry assignment
    m = re.search(r'model_registry\s*=\s*\{', text)
    if not m:
        return {}
    start = m.end() - 1
    # find matching closing brace
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

    # Find entries like "key": { ... "id": "value" ... }
    pattern = re.compile(r'"([^\"]+)"\s*:\s*\{(.*?)"id"\s*:\s*"([^\"]+)"', re.S)
    results = {}
    for m in pattern.finditer(block):
        key = m.group(1)
        hf_id = m.group(3)
        results[key] = hf_id
    return results


def check_cached(hf_id: str):
    msgs = []
    # Try transformers AutoModel
    try:
        from transformers import AutoModel
        AutoModel.from_pretrained(hf_id, local_files_only=True)
        return True, 'AutoModel'
    except Exception as e:
        msgs.append(f'AutoModel:{e}')

    # Try huggingface_hub snapshot_download
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(hf_id, local_files_only=True)
        return True, 'snapshot_download'
    except Exception as e:
        msgs.append(f'snapshot_download:{e}')

    return False, ' | '.join(msgs)


def main():
    repo_root = os.getcwd()
    embed_path = os.path.join(repo_root, 'app', 'services', 'embedding.py')
    if not os.path.exists(embed_path):
        print('embedding.py not found at', embed_path, file=sys.stderr)
        sys.exit(2)

    mapping = extract_model_registry_ids(embed_path)
    if not mapping:
        print('No model_registry entries found')
        sys.exit(1)

    for key, hf_id in mapping.items():
        ok, info = check_cached(hf_id)
        if ok:
            print(f"{key}: cached ({info})")
        else:
            print(f"{key}: NOT cached -> {info}")


if __name__ == '__main__':
    main()
