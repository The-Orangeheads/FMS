# api/v1/vector_db_controller.py
from typing import Dict, Any, List

from fastapi import APIRouter, HTTPException, status

from app.services.vector_db_service import images_db_service, documents_db_service

from app.core.vector_db import ChromaDBImpl

from app.schemas import VectorInsertRequest, VectorQueryRequest, VectorQueryResponse

router = APIRouter(prefix="/api/v1/vectors", tags=["vectors"])


def _get_service_for_collection(collection: str) -> ChromaDBImpl:
    """
    Choose which ChromaDBImpl to use based on the collection path param.
    Raise HTTPException if unknown.
    """
    key = collection.lower()
    if key == "images":
        return images_db_service
    if key == "documents":
        return documents_db_service
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown collection: {collection}")


@router.post("/{collection}/insert", status_code=status.HTTP_201_CREATED)
def insert_vector(collection: str, req: VectorInsertRequest):
    """
    Insert a single embedding into the chosen collection.
    file_path is used as the unique id (per your design).
    metadata may be omitted (None) — we pass an empty dict in that case.
    """
    svc = _get_service_for_collection(collection)

    try:
        svc.insert(req.embedding, req.file_path, req.metadata or {})
    except Exception as e:
        # You can choose to log the exception here
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    return {"status": "ok", "id": req.file_path}


@router.post("/{collection}/query", response_model=VectorQueryResponse)
def query_vectors(collection: str, req: VectorQueryRequest):
    """
    Query the chosen collection. The DB layer returns List[Dict] hits where each dict should have:
      - 'score': Optional[float]
      - 'metadata': Dict[str, Any]
    We normalize the output to the VectorQueryResponse shape.
    """
    svc = _get_service_for_collection(collection)

    try:
        raw_hits: List[Dict[str, Any]] = svc.query(req.embedding, req.k)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    # Normalize and validate shape (defensive but concise)
    matches: List[Dict[str, Any]] = []
    for hit in raw_hits or []:
        # ensure the hit is a mapping-like object
        if not isinstance(hit, dict):
            continue

        score = hit.get("score")
        metadata = hit.get("metadata") or {}

        # If metadata doesn't contain file_path but you use ids as file_path,
        # you might want to attach it here if your DB returned the id separately.
        # (Our ChromaDBImpl query is expected to include file_path in metadata.
        #  If you change that behavior to omit it, attach it based on the returned id.)
        if not isinstance(metadata, dict):
            metadata = {}

        matches.append({"score": score, "metadata": metadata})

    return VectorQueryResponse(matches=matches)
