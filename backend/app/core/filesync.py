import os
import json
from pathlib import Path
from app.core.config import settings
import threading

class fileSync:

    def load_dir(self):
        dir = Path(f"{settings.DATA_DIR}/watch_dir.json")

        if not dir.exists():
            template = { "watch_directories": [] }
            dir.write_text(json.dumps(template, indent=2))
        
        data = json.loads(dir.read_text())
        return data.get("watch_directories", [])
    
    def save_dir(self):
        dir = f"{settings.DATA_DIR}/watch_dir.json"

        with open(dir, "w") as f:
            json.dump({"watch_directories": self.watchdir}, f)
    
    def __init__(self):
        self.watchdir : list[str] = self.load_dir()
        self.sync_lock = threading.Lock
        self.watchdir_lock = threading.Lock
        self.busy = False

    def add_dir(self, dir : str):
        with self.watchdir_lock:
            self.watchdir.append(dir)
            self.save_dir()
    
    def rem_dir(self, idx : int):
        with self.watchdir_lock:
            if idx >= len(self.watchdir):
                return
            
            self.watchdir.pop(idx)
            self.save_dir()

    def get_current_state(self) -> dict[str, str]:
        dirs = []
        with self.watchdir_lock_lock:
            dirs = self.watchdir.copy()
        
        file_map = {}
        for dir in dirs:
            for root, _, files in os.walk(dir):
                for fname in files:
                    path = Path(root) / fname
                    
                    try:
                        stat = path.stat()
                        # Use mtime+size as a fingerprint
                        file_map[path] = f"{stat.st_mtime_ns}:{stat.st_size}"
                    except (PermissionError, OSError) as e:
                        print(f"Skipping {path}: {e}")
        
        return file_map
    
    def get_stored_state(self) -> dict[str, str]:
        """Returns {path: "mtime:fsize"} from ChromaDB metadata."""
        stored = {}
        results = self.collection.get(include=["metadatas"])
        if results["ids"]:
            for doc_id, meta in zip(results["ids"], results["metadatas"]):
                # Each chunk ID is "rel_path::chunk_N", extract the path
                rel_path = meta["file_path"]
                stored[rel_path] = meta["content_hash"]
        return stored

    def sync(self):
        """Syncs changes to files to DB"""

        with self.sync_lock:
            if self.busy:
                return
            self.busy = True

        cur_state = self.get_current_state()
        stored_files = self.get_stored_state()



        with self.sync_lock:
            self.busy = False

