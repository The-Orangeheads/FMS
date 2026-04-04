import os
import json
from pathlib import Path
from app.core.config import settings
import threading
import asyncio
from app.services.vector_db_service import *

class fileSync:

    def load_dir(self):
        dir = Path(f"{settings.DATA_DIR}/watch_dir.json")

        if not dir.exists():
            template = { "watch_directories": [] }
            dir.write_text(json.dumps(template, indent=2))
        
        data = json.loads(dir.read_text())
        return data.get("watch_directories", [])
    
    def save_dir(self):
        with self.watchdir_lock:
            dir = f"{settings.DATA_DIR}/watch_dir.json"

            with open(dir, "w") as f:
                json.dump({"watch_directories": self.watchdir}, f)
    
    def __init__(self):
        self.watchdir : list[str] = self.load_dir()
        self.watchdir_lock = threading.RLock()
        self.syncing_thread : asyncio.Task | None = None
        self.thread_lock = asyncio.Lock()
    
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
        with self.watchdir_lock:
            dirs = self.watchdir.copy()

        file_map = {}
        for dir in dirs:
            for root, _, files in os.walk(dir):
                for fname in files:
                    path = Path(root) / fname
                    
                    try:
                        stat = path.stat()
                        # Use mtime+size as a fingerprint
                        file_map[str(path)] = f"{stat.st_mtime_ns}:{stat.st_size}"
                    except (PermissionError, OSError) as e:
                        print(f"Skipping {path}: {e}")
        
        return file_map

    def get_outdated(self, cur_state, stored_state) -> list:
        ids_to_rem = []

        for path, val in stored_state.items():
            key = val[0]
            ids = val[1]

            if path not in cur_state or cur_state[path] != key:
                ids_to_rem.extend(ids)
        
        return ids_to_rem

    async def initiate_sync(self):
        try:
            await asyncio.wait_for(self.thread_lock.acquire(), timeout=1)
        except asyncio.TimeoutError:
            return
        print("Initiating init")
        
        try:
            if self.syncing_thread is not None:
                if not self.syncing_thread.done():
                     # sent waiting for old queue cancelling to frontend
                    self.syncing_thread.cancel()
                    
                try:
                    await self.syncing_thread
                except asyncio.CancelledError:
                    pass
                
            # sent resyncing files to frontend
            self.syncing_thread = asyncio.create_task(self.sync())
        finally:
            self.thread_lock.release()
    
    async def sync(self):
        """Syncs changes to files to DB"""
        try:
            cur_state = self.get_current_state()
            await asyncio.sleep(0)

            stored_images = images_db_service.get_state()
            await asyncio.sleep(0)

            stored_docs = documents_db_service.get_state()
            await asyncio.sleep(0)

            images_db_service.delete(self.get_outdated(cur_state, stored_images))
            await asyncio.sleep(0)

            documents_db_service.delete(self.get_outdated(cur_state, stored_docs))
            await asyncio.sleep(0)

            paths_to_add = []
            for path, key in cur_state.items():
                await asyncio.sleep(0)
                if ((path not in stored_images or key != stored_images[path][0])
                    and (path not in stored_docs or key != stored_docs[path][0])):
                    paths_to_add.append(path)
            
            #send queue to frontend
            for path in paths_to_add:
                await asyncio.sleep(0)
                # embed the path <- updates on embedding progress
                # pop from frontend queue
        
        except asyncio.CancelledError:
            return
    