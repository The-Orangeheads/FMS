import sqlite3
from app.services.vector_db_service import *
from app.services.dupes_finder_service import dupes_finder_service
import uuid
from typing import Any
import threading

class FilesDB:
    FILES_TABLE = "tracked_files"
    EMBEDDING_IDS_TABLE = "embedding_ids"
    EDGES_TABLE = "duplicate_edges"

    @property
    def conn(self):
        if not hasattr(self._local, "conn"):
            self._local.conn = sqlite3.connect(self.db_path)
            self._local.conn.execute("PRAGMA journal_mode=WAL;")
            self._local.conn.execute("PRAGMA foreign_keys = ON;")
        return self._local.conn

    @property
    def cursor(self):
        if not hasattr(self._local, "cursor"):
            self._local.cursor = self.conn.cursor()
        return self._local.cursor
    
    def __init__(self, data_path: str):
        self.db_path = data_path + "\\duplicates_db.sqlite"
        self._local = threading.local()

        self.cursor.execute(f"""
                            CREATE TABLE IF NOT EXISTS {self.FILES_TABLE} (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                file_path TEXT NOT NULL UNIQUE,
                                file_type TEXT,
                                embd_signature TEXT,
                                dd_signature TEXT,
                                mdate INTEGER,
                                file_size INTEGER
                            )
                            """)
        
        self.cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS path_idx
                            ON {self.FILES_TABLE} (file_path);
                            """)
        

        self.cursor.execute(f"""
                            CREATE TABLE IF NOT EXISTS {self.EMBEDDING_IDS_TABLE} (
                                id INTEGER,
                                embedding_id TEXT PRIMARY KEY,
                                FOREIGN KEY (id) REFERENCES {self.FILES_TABLE}(id) ON DELETE CASCADE
                            )
                            """)
        
        self.cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS id_idx
                            ON {self.EMBEDDING_IDS_TABLE} (id);
                            """)
        
        
        self.cursor.execute(f"""
                            CREATE TABLE IF NOT EXISTS {self.EDGES_TABLE} (
                                node_1 INTEGER,
                                node_2 INTEGER,
                                weight REAL,
                                PRIMARY KEY (node_1, node_2),
                                FOREIGN KEY (node_1) REFERENCES {self.FILES_TABLE}(id) ON DELETE CASCADE,
                                FOREIGN KEY (node_2) REFERENCES {self.FILES_TABLE}(id) ON DELETE CASCADE
                            )
                            """)
        
        self.cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS idx_edges_node1
                            ON {self.EDGES_TABLE} (node_1);
                            """)
        
        self.cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS idx_edges_node2
                            ON {self.EDGES_TABLE} (node_2);
                            """)
        
        self.conn.commit()

    def _get_file_id(self, path: str):
        self.cursor.execute(
            f"SELECT id FROM {self.FILES_TABLE} WHERE file_path = ?",
            (path,),
        )
        row = self.cursor.fetchone()
        return row[0] if row else None

    def get_state(self) -> dict[str, dict]:
        """
        returns a dictionary for all files in the db:

        ["file_path"] -> {"file_id": file_id, "embd_signature": embd_signature}
        """
        
        self.cursor.execute(
            f"SELECT id, file_path, embd_signature "
            f"FROM {self.FILES_TABLE}"
        )
        return {
            file_path: {
                "file_id": file_id,
                "embd_signature": embd_signature,
            }
            for file_id, file_path, embd_signature in self.cursor.fetchall()
        }
    
    def _get_batched(self, seq, n):
        for i in range(0, len(seq), n):
            yield seq[i : i + n]

    def save_file(self, embeddings: list[list[float]], contents: list[str | None], metadatas: list[dict[str, Any]], file_path: str, file_type: str, mdate: int, fsize: int):
        # insert in FILES_TABLE (file_path, file_type, NULL, NULL")
        self.cursor.execute(
            f"INSERT INTO {self.FILES_TABLE} "
            f"(file_path, file_type, embd_signature, dd_signature, mdate, file_size) "
            f"VALUES (?, ?, NULL, NULL, ?, ?)",
            (file_path, file_type, mdate, fsize),
        )
        file_id = self.cursor.lastrowid

        # if file type == "image" use images_db_service, else use documents_db_service 
        # insert embeddings, contents, metadatas in chroma
        chroma_ids = [str(uuid.uuid4()) for _ in embeddings]

        # insert link chroma_ids to the fileid in EMBEDDING_IDS_TABLE
        #! we insert this into sqlite first so that we don't get reference-less vectors in chroma on ungraceful exit
        self.cursor.executemany(
            f"INSERT INTO {self.EMBEDDING_IDS_TABLE} (id, embedding_id) VALUES (?, ?)",
            [(file_id, eid) for eid in chroma_ids],
        )
        
        self.conn.commit()

        service = images_db_service if file_type == "image" else documents_db_service
        chroma_ids = service.insert(
            ids=chroma_ids,
            embeddings=embeddings,
            contents=contents,
            metadatas=metadatas
        )
        

        # set embd_signature for id to f"{mdate}:{fsize}
        self.cursor.execute(
            f"UPDATE {self.FILES_TABLE} SET embd_signature = ? WHERE id = ?",
            (f"{mdate}:{fsize}", file_id),
        )

        self.conn.commit()

    def _get_embedding_ids(self, id : int):
        self.cursor.execute(
            f"""
            SELECT embedding_id
            FROM {self.EMBEDDING_IDS_TABLE}
            WHERE id = ?
            """,
            (id,),
        )
        
        return [row[0] for row in self.cursor.fetchall()]

    def delete_ids(self, ids: list[int]):
        if not ids:
            return
        
        chroma_ids = [[], []]
        batched_ids = list(self._get_batched(ids, 1000))

        # get all embedding_ids from EMBEDDING_IDS_TABLE where id = ids
        for batch in batched_ids:
            ids_batch = ",".join("?" * len(batch))

            self.cursor.execute(
                f"""
                SELECT e.embedding_id, f.file_type
                FROM {self.EMBEDDING_IDS_TABLE} e
                JOIN {self.FILES_TABLE} f ON e.id = f.id
                WHERE e.id IN ({ids_batch})
                """,
                batch,
            )
            
            for embd_id, file_type in self.cursor.fetchall():
                if embd_id is None:
                    continue
                chroma_ids[1 if file_type == "image" else 0].append(embd_id)
        
        if chroma_ids[0]:
            documents_db_service.delete(chroma_ids[0])
        
        if chroma_ids[1]:
            images_db_service.delete(chroma_ids[1])
        
        # # erase all from EMBEDDING_IDS_TABLE where id = ids
        # for batch in batched_ids:
        #     ids_batch = ",".join("?" * len(batch))
        #     self.cursor.execute(
        #         f"DELETE FROM {self.EMBEDDING_IDS_TABLE} "
        #         f"WHERE id IN ({ids_batch})",
        #         batch,
        #     )
            
        # # erase all from EDGES_TABLE where id1 or id2 = id
        # for batch in batched_ids:
        #     ids_batch = ",".join("?" * len(batch))
        #     self.cursor.execute(
        #         f"DELETE FROM {self.EDGES_TABLE} "
        #         f"WHERE node_1 IN ({ids_batch}) OR node_2 IN ({ids_batch})",
        #         ids_batch + ids_batch,
        #     )

        #! automatically cascades cause of foreign keys
        # erase all from FILES_TABLE where id = ids
        for batch in batched_ids:
            ids_batch = ",".join("?" * len(batch))
            self.cursor.execute(
                f"DELETE FROM {self.FILES_TABLE} "
                f"WHERE id IN ({ids_batch})",
                batch,
            )

        self.conn.commit()
    
    def __exit__(self, exc_type, exc, tb):
        self.conn.commit()
        self.conn.close()
    
    def add_dd_node(self, id1 : int, adjacency):
        
        edges = []
        for match in adjacency:
            path2: str = match.get("path", "")
            score: float = match.get("score", 0.0)
            id2: int = self._get_file_id(path2)

            if id2 is None or id1 == id2:
                continue

            n1, n2 = (id1, id2) if id1 <= id2 else (id2, id1)
            edges.append((n1, n2, score))

        if edges:
            self.cursor.executemany(
                f"""
                INSERT OR REPLACE INTO {self.EDGES_TABLE}
                (node_1, node_2, weight)
                VALUES (?, ?, ?)
                """,
                edges,
            )
        
        self.cursor.execute(
            f"""
            SELECT embd_signature
            FROM {self.FILES_TABLE}
            WHERE id = ?;
            """,
            (id1,),
        )

        embd_signature = self.cursor.fetchone()[0]
        
        self.cursor.execute(
            f"UPDATE {self.FILES_TABLE} SET dd_signature = ? WHERE id = ?",
            (embd_signature, id1),
        )

        self.conn.commit()
    
    def getSimilar(self, file_id : int, file_type : str) -> list[dict[str, Any]]:
        e_ids = self._get_embedding_ids(file_id)

        if not e_ids:
            return []
        
        db_service = images_db_service if file_type == "image" else documents_db_service
        embeddings = db_service.get_embeddings(e_ids)

        if not embeddings:
            return []
        
        if file_type == "image":
            #! assuming each image has 1 embedding
            results = dupes_finder_service.image_similarities(embedding=embeddings[0])
            return [
                {
                    "score": item["score"],
                    "path": item["metadata"]["path"],
                }
                for item in results
            ]
        else:
            #TODO when documents similarity is implemented
            return []
    
    def update_dd(self):
        # get ids, paths and file_type of all with embd_signature != dd_signature

        self.cursor.execute(
            f"SELECT id, file_type FROM {self.FILES_TABLE} "
            f"WHERE embd_signature IS NOT NULL "
            f"AND (dd_signature IS NULL OR embd_signature <> dd_signature)",
        )
    
        # query similarity based on file_type and save in the db
        for file_id, file_type in self.cursor.fetchall():
            self.add_dd_node(file_id, self.getSimilar(file_id, file_type))
    
    def get_adjecency(self, path : str):
        id = self.get_node_id(path)

        self.cursor.execute(
            f"""
            SELECT node_1, node_2, weight
              FROM {self.EDGES_TABLE} WHERE node_1 = ?
            UNION ALL
            SELECT node_1, node_2, weight
              FROM {self.EDGES_TABLE} WHERE node_2 = ?
            """,
            (id, id),
        )

        results = self.cursor.fetchall()
        return results
    