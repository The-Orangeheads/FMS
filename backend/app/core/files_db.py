import sqlite3
from app.services.vector_db_service import *
from app.services.dupes_finder_service import dupes_finder_service
import uuid
from typing import Any
import threading
import itertools

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
                                text_embd_signature TEXT,
                                image_embd_signature TEXT,
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
                    CREATE INDEX IF NOT EXISTS type_idx
                    ON {self.FILES_TABLE} (file_type);
                    """)

        self.cursor.execute(f"""
                            CREATE TABLE IF NOT EXISTS {self.EMBEDDING_IDS_TABLE} (
                                id INTEGER,
                                embedding_id TEXT PRIMARY KEY,
                                embedding_type TEXT,
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
        
        self.cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS idx_edges_node1
                            ON {self.EDGES_TABLE} (node_1, weight DESC, node_2);
                            """)
        
        self.cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS idx_edges_node2
                            ON {self.EDGES_TABLE} (node_2, weight DESC, node_1);
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

        ["file_path"] -> {"file_id": file_id, "text_embd_signature": text_embd_signature, "image_embd_signature": image_embd_signature}
        """
        
        self.cursor.execute(
            f"SELECT id, file_path, text_embd_signature, image_embd_signature "
            f"FROM {self.FILES_TABLE}"
        )
        return {
            file_path: {
                "file_id": file_id,
                "text_embd_signature": text_embd_signature,
                "image_embd_signature": image_embd_signature
            }
            for file_id, file_path, text_embd_signature, image_embd_signature in self.cursor.fetchall()
        }
    
    def _get_batched(self, seq, n):
        for i in range(0, len(seq), n):
            yield seq[i : i + n]

    def save_file(self, embed_type: str, embeddings: list[list[float]], contents: list[str | None], metadatas: list[dict[str, Any]], file_path: str, file_type: str, mdate: int, fsize: int):
        # insert in FILES_TABLE (file_path, file_type, NULL, NULL, NULL")
        res = self.cursor.execute(
            f"INSERT INTO {self.FILES_TABLE} "
            f"(file_path, file_type, mdate, file_size) "
            f"VALUES (?, ?, ?, ?) "
            f"ON CONFLICT(file_path) DO UPDATE SET "
            f"mdate=excluded.mdate, "
            f"file_size=excluded.file_size "
            f"RETURNING id",
            (file_path, file_type, mdate, fsize),
        ).fetchone()
        
        file_id = res[0]

        # if file type == "image" use images_db_service, else use documents_db_service 
        # insert embeddings, contents, metadatas in chroma
        chroma_ids = [str(uuid.uuid4()) for _ in embeddings]

        # insert link chroma_ids to the fileid in EMBEDDING_IDS_TABLE
        #! we insert this into sqlite first so that we don't get reference-less vectors in chroma on ungraceful exit
        self.cursor.executemany(
            f"INSERT INTO {self.EMBEDDING_IDS_TABLE} (id, embedding_id, embedding_type) VALUES (?, ?, ?)",
            [(file_id, eid, embed_type) for eid in chroma_ids],
        )
        
        self.conn.commit()

        service = images_db_service if embed_type == "image" else documents_db_service
        chroma_ids = service.insert(
            ids=chroma_ids,
            embeddings=embeddings,
            contents=contents,
            metadatas=metadatas
        )

        # set embd_signature for id to f"{mdate}:{fsize}
        self.cursor.execute(
            f"UPDATE {self.FILES_TABLE} SET {"image_embd_signature" if embed_type == "image" else "text_embd_signature"} = ? WHERE id = ?",
            (f"{mdate}:{fsize}", file_id),
        )

        self.conn.commit()
    
    def delete_ids(self, ids: list[int], embd_type: str):
        if not ids:
            return
        
        chroma_ids = []
        batched_ids = list(self._get_batched(ids, 1000))

        # get all embedding_ids from EMBEDDING_IDS_TABLE where id = ids
        for batch in batched_ids:
            ids_batch = ",".join("?" * len(batch))

            self.cursor.execute(
                f"""
                SELECT embedding_id
                FROM {self.EMBEDDING_IDS_TABLE}
                WHERE embedding_type = "{embd_type}" AND id IN ({ids_batch})
                """,
                batch,
            )
            
            for embd_id in self.cursor.fetchall():
                chroma_ids.append(embd_id[0])
        
        if chroma_ids:
            (images_db_service if embd_type == "image" else documents_db_service).delete(chroma_ids)
        
        for batch in batched_ids:
            ids_batch = ",".join("?" * len(batch))
            self.cursor.execute(
                f"UPDATE {self.FILES_TABLE} "
                f"SET {'image_embd_signature' if embd_type == 'image' else 'text_embd_signature'} = NULL "
                f"WHERE id IN ({ids_batch})",
                batch,
            )
        
        self.conn.commit()
    
    def clean_file_table(self):
        self.cursor.execute(
                f"DELETE FROM {self.FILES_TABLE} "
                f"WHERE text_embd_signature is NULL AND image_embd_signature is NULL",
            )
        self.conn.commit()

    def __exit__(self, exc_type, exc, tb):
        self.conn.commit()
        self.conn.close()
    
    def _add_dd_node(self, id1 : int, adjacency : list[dict[str, Any]]):
        """
            # DOES NOT COMMIT
        """
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
    
    def get_similar(self, e_ids : list[str], file_type : str) -> list[dict[str, Any]]:
        if not e_ids:
            return []
        
        db_service = images_db_service if file_type == "image" else documents_db_service
        embeddings = db_service.get_embeddings(e_ids)

        if len(embeddings) == 0:
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

    def _process_batch(self, batch_size : int = 1000) -> bool:
        """
        # DOES NOT COMMIT
        
        returns whether or not there were batches to process
        """

        cursor = self.cursor.execute(
            f"""
                SELECT f.id, f.file_type, eid.embedding_id, f.image_embd_signature
                FROM {self.FILES_TABLE} f
                JOIN {self.EMBEDDING_IDS_TABLE} eid ON f.id = eid.id
                WHERE f.id IN (
                    SELECT id
                    from {self.FILES_TABLE}
                    WHERE dd_signature IS NOT image_embd_signature AND file_type = "image"
                    LIMIT ?
                )
            """, (batch_size,)
        )

        first = cursor.fetchone()
        if first is None:
            return False
        
        rows = itertools.chain([first], cursor)
        
        result = {}
        """
            result[id] = (file_type, embedding_id_list)
        """
        for f_id, file_type, embedding_id, image_embd_signature in rows:
            result.setdefault(f_id, (file_type, image_embd_signature, []))[2].append(embedding_id) # for images

        update_ids : list[(int, str)] = []
        for f_id, (file_type, embd_signature, embedding_ids) in result.items():
            
            adj = self.get_similar(
                e_ids=embedding_ids,
                file_type=file_type
            )

            self._add_dd_node(
                id1=f_id,
                adjacency=adj
            )

            update_ids.append((f_id, embd_signature))

        self.cursor.executemany(
            f"""
                UPDATE {self.FILES_TABLE}
                SET dd_signature = ?
                WHERE id = ?
            """, [(embd_signature,i,) for (i, embd_signature) in update_ids]
        )

        return True

    async def sync_dd(self):
        while(self._process_batch()):
            self.conn.commit()
    
    def get_page(
        self,
        page_number: int,
        page_size: int,
        edge_limit: int
    ) -> tuple[list[dict[str, Any]], list[tuple[int, int, float]]]:
        if page_number < 0:
            raise ValueError("page_number must be >= 0")
        if page_size <= 0:
            return [], []
        if edge_limit < 0:
            raise ValueError("edge_limit must be >= 0")

        offset = page_number * page_size
        cur = self.conn.cursor()

        # Page nodes are ranked by their strongest incident edge.
        cur.execute(f"""
            SELECT
                f.id,
                f.file_path,
                f.file_size,
                f.mdate,
                COALESCE(MAX(e.weight), 0.0) AS max_weight
            FROM {self.FILES_TABLE} AS f
            LEFT JOIN {self.EDGES_TABLE} AS e
                ON e.node_1 = f.id OR e.node_2 = f.id
            GROUP BY f.id, f.file_path, f.file_size, f.mdate
            ORDER BY max_weight DESC, f.id ASC
            LIMIT ? OFFSET ?;
        """, (page_size, offset))

        page_rows = cur.fetchall()
        if not page_rows:
            return [], []

        page_ids = [row[0] for row in page_rows]
        page_data = {
            row[0]: {
                "path": row[1],
                "file_size": row[2],
                "modify_date": row[3],
            }
            for row in page_rows
        }

        edges: list[tuple[int, int, float]] = []
        seen_edges: set[tuple[int, int]] = set()

        # Fetch the top edges for each page node.
        if edge_limit > 0:
            values_clause = ", ".join(["(?)"] * len(page_ids))

            cur.execute(f"""
                WITH page_nodes(id) AS (
                    VALUES {values_clause}
                ),
                ranked_edges AS (
                    SELECT
                        pn.id AS source_id,
                        e.node_1,
                        e.node_2,
                        e.weight,
                        ROW_NUMBER() OVER (
                            PARTITION BY pn.id
                            ORDER BY e.weight DESC, e.node_1 ASC, e.node_2 ASC
                        ) AS rn
                    FROM page_nodes pn
                    JOIN {self.EDGES_TABLE} e
                        ON e.node_1 = pn.id OR e.node_2 = pn.id
                )
                SELECT node_1, node_2, weight
                FROM ranked_edges
                WHERE rn <= ?
                ORDER BY weight DESC, node_1 ASC, node_2 ASC;
            """, (*page_ids, edge_limit))

            for node_1, node_2, weight in cur.fetchall():
                a, b = (node_1, node_2) if node_1 <= node_2 else (node_2, node_1)
                edge_key = (a, b)
                if edge_key not in seen_edges:
                    seen_edges.add(edge_key)
                    edges.append((node_1, node_2, float(weight)))

        if not edges:
            return [], []  # no duplicate/connected context to show

        # Collect every node mentioned by those edges.
        required_ids = set(page_ids)
        for node_1, node_2, _ in edges:
            required_ids.add(node_1)
            required_ids.add(node_2)

        # Query only the extra nodes that were not already fetched in the first query.
        extra_ids = sorted(required_ids - set(page_ids))
        extra_data: dict[int, dict[str, Any]] = {}

        if extra_ids:
            placeholders = ",".join(["?"] * len(extra_ids))
            cur.execute(
                f"""
                SELECT id, file_path, file_size, mdate
                FROM {self.FILES_TABLE}
                WHERE id IN ({placeholders});
                """,
                extra_ids,
            )
            extra_data = {
                row[0]: {
                    "path": row[1],
                    "file_size": row[2],
                    "modify_date": row[3],
                }
                for row in cur.fetchall()
            }

        nodes: list[dict[str, Any]] = []
        for node_id in page_ids:
            node = {"id": node_id}
            node.update(page_data[node_id])
            nodes.append(node)

        for node_id in extra_ids:
            data = extra_data.get(node_id)
            if data is not None:
                node = {"id": node_id}
                node.update(data)
                nodes.append(node)

        return nodes, edges
    
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
    