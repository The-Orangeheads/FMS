import os
import json
from pathlib import Path
from app.core.config import settings
import threading
import asyncio
from app.services.vector_db_service import *
from app.services.file_handler_service import *
from app.core.websockets import ws_manager


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
        
    async def get_current_sync_thread(self) -> asyncio.Task | None:
        async with self.thread_lock:
            return self.syncing_thread
        
    async def safe_wait(self, task : asyncio.Task | None):
        if task is not None:
            try:
                await task
            except asyncio.CancelledError:
                pass
        
    async def auto_sync(self):
        try:
            while True:
                start = asyncio.get_event_loop().time()

                #! consider adding this if we don't want auto sync to interrupt manual sync
                # await self.safe_wait(await self.get_current_sync_thread())

                await self.initiate_sync()
                await self.safe_wait(await self.get_current_sync_thread())

                elapsed = asyncio.get_event_loop().time() - start
                await asyncio.sleep(max(0, settings.auto_sync_interval_seconds - elapsed))
        except asyncio.CancelledError:
            pass
    def __init__(self):
        self.watch_dirs = set(self.load_dir())
        self.watch_dirs_lock = threading.RLock()
        self.syncing_thread : asyncio.Task | None = None
        self.thread_lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self.cancel_queue = False
    
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
                self.watch_dirs.remove(dir)
                self.save_dir()
        except:
            raise Exception(f"directory \"{dir}\", does not exist in tracked directories.")

    def get_current_state(self) -> list[dict[str, str] | dict[str, list[str | int]] | int]:

        dirs = self.get_dirs()
        file_map = {}

        file_data : dict[str, list[str | int]] = {}
        other_count : int = 0
        other_size : int = 0
        """
            "path" : [type, size]
        """

        for dir in dirs:
            for root, _, files in os.walk(dir):
                for fname in files:
                    path = Path(root) / fname
                    
                    try:
                        stat = path.stat()
                        file_type = file_handler.detect_file_type(str(path))

                        if file_type == "other":
                            other_count += 1
                            other_size += stat.st_size
                            continue

                        path_str = str(path)

                        # Use mtime+size as a fingerprint
                        file_map[path_str] = f"{stat.st_mtime_ns}:{stat.st_size}"

                        file_data[path_str] = [file_type, stat.st_size]
                    except (PermissionError, OSError) as e:
                        print(f"Skipping {path}: {e}")
        
        return [file_map, file_data, other_count, other_size]

    def get_outdated(self, cur_state, stored_state) -> list:
        ids_to_rem = []

        for path, val in stored_state.items():
            key = val[0]
            ids = val[1]

            if path not in cur_state or cur_state[path] != key:
                ids_to_rem.extend(ids)
        
        return ids_to_rem
    
    def sync_notify(self,message_text):
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast(json.dumps({
                "type": "FILE_STATUS",
                "message": message_text
            })),
            self._loop
    )
        
    async def check_cancel(self):
        await asyncio.sleep(0)
        if self.cancel_queue:
            raise asyncio.CancelledError()

    async def initiate_sync(self):
        try:
            await asyncio.wait_for(self.thread_lock.acquire(), timeout=1)
        except asyncio.TimeoutError:
            return
        
        try:
            self.cancel_queue = True

            if self.syncing_thread is not None:
                try:
                    await self.syncing_thread
                except asyncio.CancelledError:
                    pass

            self.cancel_queue = False

            self.syncing_thread = asyncio.create_task(self.sync())
        
        finally:
            self.thread_lock.release()
    
    async def sync(self):
        """Syncs changes to files to DB"""
        try:
            self._loop = asyncio.get_event_loop()
            print("reading file changes")
            analytics : dict[str, list[int]] = {
                "image": [0, 0, 0, 0],
                "audio": [0, 0, 0, 0],
                "document": [0, 0, 0, 0],
                "other": [0, 0, 0, 0]
            }
            """
                file_data["category/type"] = [done, total, done_size, total_size]
            """

            [cur_state, file_data, analytics["other"][1], analytics["other"][3]] = self.get_current_state()
            
            await self.check_cancel()

            stored_images = images_db_service.get_state()
            await self.check_cancel()

            stored_docs = documents_db_service.get_state()
            await self.check_cancel()

            print("deleting outdated embeddings")
            images_db_service.delete(self.get_outdated(cur_state, stored_images))
            await self.check_cancel()

            documents_db_service.delete(self.get_outdated(cur_state, stored_docs))
            await self.check_cancel()

            print("initializing queue")
            paths_to_add = []
            for path, key in cur_state.items():
                await self.check_cancel()

                [file_type, fsize] = file_data[path]
                category = analytics[file_type]
                category[0] += 1
                category[1] += 1
                category[2] += fsize
                category[3] += fsize
                if ((path not in stored_images or key != stored_images[path][0])
                    and (path not in stored_docs or key != stored_docs[path][0])):
                    category[0] -= 1
                    category[2] -= fsize
                    paths_to_add.append(path)

            
            #send queue to frontend and unlock sync button
            # websocket magic here
            total_files = len(paths_to_add)
            queue_data = [{"id": p, "name": os.path.basename(p)} for p in paths_to_add]
            await ws_manager.broadcast(
                json.dumps({
                    "type": "START_SYNC",
                    # "status": "started",
                    "total": total_files,
                    "queue": queue_data,
                    "analytics": analytics
                    })
                )
            
            for index, path in enumerate(paths_to_add):
                await self.check_cancel()


                [file_type, fsize] = file_data[path]

                try:
                    loop = asyncio.get_event_loop()
                    start_time = loop.time()

                    #! TIME BOMB PREVENTION SQUAD: uncommnet, uncommen, comment (next 3 lines) if you don't have models
                    # print(f"Processing: {path}")
                    # await asyncio.sleep(5)
                    await loop.run_in_executor(None, lambda p=path: file_handler.process_file(p, notify_cb=self.sync_notify))

                    duration = round(loop.time() - start_time, 3)

                    # Update analytics for completed file
                    if file_type in analytics:
                        analytics[file_type][0] += 1  # increment entries_done
                        analytics[file_type][2] += fsize  # increment size_done

                    await ws_manager.broadcast(json.dumps({
                        "type": "SYNC_PROGRESS",
                        "current_file": os.path.basename(path),
                        "progress": int((index + 1) / total_files * 100),
                        "remaining": total_files - index - 1,
                        "duration_seconds": duration,
                        "analytics": analytics
                    }))
                except Exception as e:
                    await ws_manager.broadcast(json.dumps({
                        "type": "SYNC_ERROR",
                        "file": os.path.basename(path),
                        "error": str(e)
                    }))
        
        except asyncio.CancelledError:
            return
        
        await ws_manager.broadcast(json.dumps({"type": "SYNC_COMPLETE"}))

    
