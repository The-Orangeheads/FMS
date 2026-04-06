import os
import json
from pathlib import Path
from app.core.config import settings
import threading
import asyncio
from app.services.vector_db_service import *
from app.services.file_handler_service import *

class fileSync:

    def load_dir(self):
        dir = Path(f"{settings.DATA_DIR}/watch_dir.json")

        if not dir.exists():
            template = { "watch_directories": [] }
            dir.write_text(json.dumps(template, indent=2))
        
        data = json.loads(dir.read_text())
        return data.get("watch_directories", [])
    
    def save_dir(self):
        dirs = self.get_dirs()
        path = f"{settings.DATA_DIR}/watch_dir.json"

        with open(path, "w") as f:
            json.dump({"watch_directories": dirs}, f)
    
    def get_dirs(self):
        with self.watch_dirs_lock:
            return list(self.watch_dirs)
    
    def __init__(self):
        self.watch_dirs = set(self.load_dir())
        self.watch_dirs_lock = threading.RLock()
        self.syncing_thread : asyncio.Task | None = None
        self.thread_lock = asyncio.Lock()
    
    def add_dir(self, dir : str):
        try:
            with self.watch_dirs_lock:
                self.watch_dirs.add(dir)
                self.save_dir()
        except:
            raise Exception(f"directory \"{dir}\", already exists in tracked directories.")
    
    def rem_dir(self, dir : str):
        try:
            with self.watch_dirs_lock:
                self.watch_dirs.pop(dir)
                self.save_dir()
        except:
            raise Exception(f"directory \"{dir}\", does not exist in tracked directories.")

    def get_current_state(self) -> dict[str, str]:

        dirs = self.get_dirs()
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
                try:
                    file_handler.process_file(path)
                except Exception as e:
                    #notify frontend of failed
                    pass
                
                # pop from frontend queue
        
        except asyncio.CancelledError:
            return
    