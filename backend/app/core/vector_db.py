"""
Vector Database Handler Module
Handles Database modifications
"""


import chromadb
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

# 1. Abstract Base Class
class VectorDatabase(ABC):
    @abstractmethod
    def insert(self, embedding: List[float], file_path: str, metadata: Optional[Dict[str, Any]] = None):
        """Add an embedding with its source file path and optional metadata to the database."""
        pass

    @abstractmethod
    def query(self, embedding: List[float], k: int) -> List[Dict[str, Any]]:
        """
        Return the top k matches for the query embedding.
        Each returned item is a dict with keys:
          - 'score': cosine similarity (float) or None if not available
          - 'metadata': the stored metadata dict for the matched vector
        """
        pass

# 2. ChromaDB Implementation
class ChromaDBImpl(VectorDatabase):
    def __init__(self, data_path: str, collection_name: str = "my_collection"):
        # Initialize the persistent client (saves to disk)
        self.client = chromadb.PersistentClient(path=data_path)
        
        # Get or create a collection for the vectors
        # Using cosine similarity as it's standard for most embeddings
        self.collection = self.client.get_or_create_collection(
            name=collection_name, 
            metadata={"hnsw:space": "cosine"}
        )

    def insert(self, embedding: List[float], file_path: str, metadata: Optional[Dict[str, Any]] = None):
        if metadata is None:
            metadata = {}
        # do not store file_path inside metadata; use it as the id
        self.collection.add(embeddings=[embedding], metadatas=[metadata], ids=[file_path])


    def query(self, embedding: List[float], k: int) -> List[Dict[str, Any]]:
        results = self.collection.query(
            query_embeddings=[embedding],
            n_results=k,
            include=["metadatas", "distances"]
        )
        ids = results["ids"][0]            # list of ids (one per result)
        metas = results["metadatas"][0]    # list of metadata dicts (may be empty dicts)
        dists = results["distances"][0]    # list of distances (cosine distance if collection uses cosine)

        hits = []
        for _id, meta, dist in zip(ids, metas, dists):
            # if metadata was empty, create an object and add file_path from the id
            meta_out = dict(meta or {})
            meta_out.setdefault("file_path", _id)  # attach file_path using the id
            try:
                score = 1.0 - float(dist)  # convert cosine distance -> similarity
            except Exception:
                score = None
            hits.append({"score": score, "metadata": meta_out})

        return hits


# -- Example Usage 
# db = ChromaDBImpl(data_path="./chroma_storage")
# db.insert([0.1, 0.2, 0.3], "images/car.jpg")
# matches = db.query([0.1, 0.2, 0.3], k=1)
# print(matches) # Output: ['images/car.jpg']