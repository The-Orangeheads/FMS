"""
Vector Database Handler Module
Handles Database modifications
"""
import os

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
        else:
            metadata = metadata or {}
        
        metadata["path"] = file_path
        
        unique_id = str(uuid.uuid4())
        # print(f"Inserting: {[unique_id, file_path, metadata]}") #! FOR DEBUGGING, REMOVE LATER
        
        self.collection.add(
            embeddings=[embedding], 
            metadatas=[metadata], 
            ids=[unique_id],
            documents=[content] if content else None
        )

    def query(self, embedding: List[float], k: int) -> List[Dict[str, Any]]:
        results = self.collection.query(
            query_embeddings=[embedding],
            n_results=k,
            include=["metadatas", "distances", "documents"]
        )
        
        ids = results["ids"][0]
        metas = results["metadatas"][0]    # list of metadata dicts (may be empty dicts)
        dists = results["distances"][0]    # list of distances (cosine distance if collection uses cosine)
        docs = results["documents"][0]
        
        hits = []
        for id, meta, dist, doc in zip(ids, metas, dists, docs):
            # if metadata was empty, create an object and add file_path from the id
            meta_out = dict(meta or {})
            try:
                score = 1.0 - float(dist)  # convert cosine distance -> similarity
            except Exception:
                score = None
            hits.append({"id": id, "score": score, "metadata": meta_out, "document": doc})

        return hits

    def get_state(self):
        results = self.collection.get(include=["metadatas"])
        
        stored = {}
        if results.get("ids"):
            for meta, id in zip(results["metadatas"], results["ids"]):
                path = meta.get("path", "NA") 
                mdate = meta.get("mdate", "NA")
                fsize = meta.get("fsize", "NA")
                entry = stored.setdefault(path, [f"{mdate}:{fsize}", []])
                entry[1].append(id)
        return stored
        
    def delete(self, ids : list[str]):
        # print(f"Deleting: {ids}") #! FOR DEBUGGING, REMOVE LATER
        if not ids:
            return
        self.collection.delete(ids=ids)
# -- Example Usage 
# db = ChromaDBImpl(data_path="./chroma_storage")
# db.insert([0.1, 0.2, 0.3], "images/car.jpg")
# matches = db.query([0.1, 0.2, 0.3], k=1)
# print(matches) # Output: ['images/car.jpg']