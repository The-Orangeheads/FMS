import types
import pytest
from app.core import vector_db


class FakeCollection:
    def __init__(self):
        self.store = {}  # id -> (embedding, metadata)

    def add(self, embeddings, metadatas, ids):
        for emb, meta, _id in zip(embeddings, metadatas, ids):
            self.store[_id] = (emb, meta)

    def query(self, query_embeddings, n_results, include):
        # naive: return stored ids up to n_results, distances = 0 for identical, else 1
        q = query_embeddings[0]
        ids = []
        metas = []
        dists = []
        for _id, (emb, meta) in list(self.store.items())[:n_results]:
            ids.append(_id)
            metas.append(meta)
            dists.append(0.0 if emb == q else 1.0)

        return {"ids": [ids], "metadatas": [metas], "distances": [dists]}


class FakeClient:
    def __init__(self, path=None):
        self.path = path
        self._collections = {}

    def get_or_create_collection(self, name, metadata=None):
        if name not in self._collections:
            self._collections[name] = FakeCollection()
        return self._collections[name]


def test_chromadb_impl_monkeypatched(monkeypatch, tmp_path):
    # Patch chromadb.PersistentClient used in the module
    monkeypatch.setattr(vector_db, 'chromadb', types.SimpleNamespace(PersistentClient=lambda path: FakeClient(path)))

    db = vector_db.ChromaDBImpl(str(tmp_path), "test_coll")

    # insert two vectors
    db.insert([0.1, 0.2], "file1.txt", metadata={"a": 1})
    db.insert([0.5, 0.6], "file2.txt", metadata={"b": 2})
    # query similar to first vector
    hits = db.query([0.1, 0.2], k=2)
    assert isinstance(hits, list)
    assert len(hits) == 2
    assert hits[0]["metadata"].get("file_path") == "file1.txt"
    assert hits[0]["score"] == 1.0
