"""
Vector Database Handler Module
Handles Database modifications
"""


import chromadb
from abc import ABC, abstractmethod
from typing import List

# 1. Abstract Base Class
class VectorDatabase(ABC):
    @abstractmethod
    def insert(self, embedding: List[float], file_path: str):
        """Add an embedding and its source file path to the database."""
        pass

    @abstractmethod
    def query(self, embedding: List[float], k: int) -> List[str]:
        """Return the top k file paths matching the query embedding."""
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

    def insert(self, embedding: List[float], file_path: str):
        # We use the file_path as the unique ID, 
        # and also store it in metadata for easy retrieval
        self.collection.add(
            embeddings=[embedding],
            metadatas=[{"file_path": file_path}],
            ids=[file_path] 
        )

    def query(self, embedding: List[float], k: int) -> List[str]:
        results = self.collection.query(
            query_embeddings=[embedding],
            n_results=k
        )
        
        # results['metadatas'] returns a list of lists of dictionaries
        # We extract the 'file_path' from the inner dictionaries
        file_paths = [meta['file_path'] for meta in results['metadatas'][0]]
        return file_paths

# -- Example Usage 
# db = ChromaDBImpl(data_path="./chroma_storage")
# db.insert([0.1, 0.2, 0.3], "images/car.jpg")
# matches = db.query([0.1, 0.2, 0.3], k=1)
# print(matches) # Output: ['images/car.jpg']