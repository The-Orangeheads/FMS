"""
Vector Database Handler Module
Handles Database modifications
"""
import chromadb
from chromadb.config import Settings as ChromaSettings
from typing import Any
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

    def insert(self, ids : list[str], embeddings: list[list[float]], contents: list[str | None], metadatas: list[dict[str, Any]]):
        if not embeddings:
            return []
        
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=contents,
            metadatas=metadatas,
        )

    def query(self, embedding: list[float], k: int) -> list[dict[str, Any]]:
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

    #TODO test if returned distasnces are always sorted or not
    def query_similarity(self, embedding: list[float], min_similarity: float, min_k: int = 16, max_k: int = 1048576) -> list[dict[str, Any]]:
        k = min(min_k, max_k)
        max_dist = 1.0 - min_similarity
        while(k <= max_k):
            results = self.collection.query(
                query_embeddings=[embedding],
                n_results=k,
                include=["metadatas", "distances"]
            )
            if(float(results['distances'][0][-1]) > max_dist): #TODO try replacing checking last with checking overall minimum
                break
            k *= 2
        
        dists = results["distances"][0]    # list of distances (cosine distance if collection uses cosine)
        metas = results["metadatas"][0]

        hits = []
        for meta, dist in zip(metas, dists):
            # if metadata was empty, create an object and add file_path from the id
            meta_out = dict(meta or {})
            try:
                score = 1.0 - float(dist)  # convert cosine distance -> similarity
            except Exception:
                score = None
            hits.append({"score": score, "metadata": meta_out})

        return hits

    def get_embeddings(self, ids : list[str]) -> list[list[float]]:
        if not ids:
            return
        results = self.collection.get(
            ids=["your_id"],
            include=["embeddings"]
        )
        return results["embeddings"]
# -- Example Usage 
# db = ChromaDBImpl(data_path="./chroma_storage")
# db.insert([0.1, 0.2, 0.3], "images/car.jpg")
# matches = db.query([0.1, 0.2, 0.3], k=1)
# print(matches) # Output: ['images/car.jpg']