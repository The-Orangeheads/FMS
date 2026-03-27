"""
Vector Database Handler Module
Handles Database modifications
"""

import chromadb
from chromadb.config import Settings as ChromaSettings
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import uuid

# 2. ChromaDB Implementation
class ChromaDBImpl():
    def __init__(self, data_path: str, collection_name: str = "my_collection"):
        # Initialize the persistent client (saves to disk). allow_reset=True for Clear DB.
        self.client = chromadb.PersistentClient(
            path=data_path,
            settings=ChromaSettings(allow_reset=True)
        )
        
        # Get or create a collection for the vectors
        # Using cosine similarity as it's standard for most embeddings
        self.collection = self.client.get_or_create_collection(
            name=collection_name, 
            metadata={"hnsw:space": "cosine"}
        )

    def insert(self, embedding: List[float], file_path: str, metadata: Optional[Dict[str, Any]] = None, content: Optional[str] = None):
        if metadata is not None and len(metadata) == 0:
            metadata = None

        unique_id = str(uuid.uuid4())
        
        self.collection.add(
            embeddings=[embedding], 
            metadatas=[metadata], 
            ids=[unique_id],
            path=file_path,
            documents=[content] if content else None
        )

    def query(self, embedding: List[float], k: int) -> List[Dict[str, Any]]:
        results = self.collection.query(
            query_embeddings=[embedding],
            n_results=k,
            include=["metadatas", "distances", "documents", "path"]
        )
        metas = results["metadatas"][0]    # list of metadata dicts (may be empty dicts)
        dists = results["distances"][0]    # list of distances (cosine distance if collection uses cosine)
        paths = results["path"][0]         # list of pathes
        docs = results["documents"][0]
        
        hits = []
        for path, meta, dist, doc in zip(paths, metas, dists, docs):
            # if metadata was empty, create an object and add file_path from the id
            meta_out = dict(meta or {})
            meta_out.setdefault("file_path", path)  # attach file_path using the id
            try:
                score = 1.0 - float(dist)  # convert cosine distance -> similarity
            except Exception:
                score = None
            hits.append({"score": score, "metadata": meta_out, "document": doc})

        return hits

    #TODO instead of querying every chunk for files to modify, handle it some other way with unique files only
    def get_state(self):
        results = self.collection.get(
            include=["metadatas", "path"]
        )
        
        stored = {}
        if results["ids"]:
            for path, meta in zip(results["path"], results["metadatas"]):
                stored[path] = f"{meta["mdate"]}:{meta["fsize"]}"  #! MAKE SURE THESE ARE STORED IN METADATA
        return stored
        
# -- Example Usage 
# db = ChromaDBImpl(data_path="./chroma_storage")
# db.insert([0.1, 0.2, 0.3], "images/car.jpg")
# matches = db.query([0.1, 0.2, 0.3], k=1)
# print(matches) # Output: ['images/car.jpg']