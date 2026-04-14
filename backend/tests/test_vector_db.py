import pytest
import tempfile
from typing import List, Dict, Any

from app.core.vector_db import ChromaDBImpl


# -------------------------
# Fixtures
# -------------------------

@pytest.fixture
def temp_db(tmp_path):
    """Create a temporary ChromaDB instance."""
    db_path = tmp_path / "chroma"

    db = ChromaDBImpl(
        data_path=str(db_path),
        collection_name="test_collection"
    )

    yield db

    # force close references
    del db

@pytest.fixture
def sample_embedding():
    return [0.1, 0.2, 0.3]


@pytest.fixture
def sample_metadata():
    return {"label": "car", "source": "dataset"}


# -------------------------
# Insert Tests
# -------------------------

@pytest.mark.parametrize(
    "embedding,metadata",
    [
        ([0.1, 0.2, 0.3], None),
        ([0.5, 0.6, 0.7], {"label": "dog"}),
        ([0.9, 0.1, 0.2], {"category": "animal", "confidence": 0.9}),
    ],
)
def test_insert_and_query_basic(temp_db, embedding, metadata):
    """Ensure inserted vectors can be queried."""
    file_path = "test_image.jpg"

    temp_db.insert(embedding, file_path, metadata)

    results = temp_db.query(embedding, k=1)

    assert len(results) == 1
    assert "score" in results[0]
    assert "metadata" in results[0]
    assert results[0]["metadata"]["file_path"] == file_path


# -------------------------
# Query Tests
# -------------------------

def test_query_returns_correct_k(temp_db):
    """Query should return at most k results."""
    embeddings = [
        ([0.1, 0.2, 0.3], "a.jpg"),
        ([0.4, 0.5, 0.6], "b.jpg"),
        ([0.7, 0.8, 0.9], "c.jpg"),
    ]

    for emb, fp in embeddings:
        temp_db.insert(emb, fp)

    results = temp_db.query([0.1, 0.2, 0.3], k=2)

    assert len(results) <= 2


def test_query_score_range(temp_db, sample_embedding):
    """Score should be between -inf and 1 (cosine similarity)."""
    temp_db.insert(sample_embedding, "image.jpg")

    results = temp_db.query(sample_embedding, 1)

    score = results[0]["score"]
    assert score is None or score <= 1.0


# -------------------------
# Metadata Handling
# -------------------------

def test_metadata_preserved(temp_db, sample_embedding, sample_metadata):
    """Ensure metadata is preserved after retrieval."""
    file_path = "image_meta.jpg"

    temp_db.insert(sample_embedding, file_path, sample_metadata)

    results = temp_db.query(sample_embedding, 1)

    meta = results[0]["metadata"]

    for key, value in sample_metadata.items():
        assert meta[key] == value


def test_file_path_added_if_missing(temp_db, sample_embedding):
    """file_path should be automatically added to metadata."""
    file_path = "image_path.jpg"

    temp_db.insert(sample_embedding, file_path, metadata={})

    results = temp_db.query(sample_embedding, 1)

    assert results[0]["metadata"]["file_path"] == file_path


# -------------------------
# Error Handling
# -------------------------

def test_invalid_embedding_insert(temp_db):
    """Ensure invalid embeddings raise errors."""
    with pytest.raises(Exception):
        temp_db.insert("not_a_vector", "bad.jpg")


def test_invalid_query_embedding(temp_db):
    """Ensure invalid query embedding raises errors."""
    with pytest.raises(Exception):
        temp_db.query("not_a_vector", k=1)


# -------------------------
# Multiple Inserts
# -------------------------

@pytest.mark.integration
def test_multiple_insert_and_query(temp_db):
    """Test querying among multiple embeddings."""
    vectors = [
        ([0.1, 0.2, 0.3], "img1.jpg"),
        ([0.9, 0.8, 0.7], "img2.jpg"),
        ([0.2, 0.1, 0.3], "img3.jpg"),
    ]

    for emb, path in vectors:
        temp_db.insert(emb, path)

    results = temp_db.query([0.1, 0.2, 0.3], k=2)

    assert len(results) == 2
    assert all("metadata" in r for r in results)