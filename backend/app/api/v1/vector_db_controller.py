from typing import Dict, Any, List, Optional
import logging
from fastapi import APIRouter, HTTPException, status

from app.services.vector_db_service import images_db_service, documents_db_service
from app.core.vector_db import ChromaDBImpl
from app.schemas import VectorInsertRequest, VectorQueryRequest, VectorQueryResponse, ChunkInput
from app.services.embedding import embedding_service

# Initialize logging for cleaner debugging
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/vectors", tags=["vectors"])

# Collection mapping for cleaner lookups
COLLECTION_MAP = {
    "images": images_db_service,
    "documents": documents_db_service
}

def _get_service_for_collection(collection: str) -> ChromaDBImpl:
    service = COLLECTION_MAP.get(collection.lower())
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Collection '{collection}' not found. Available: {list(COLLECTION_MAP.keys())}"
        )
    return service

@router.post("/{collection}/insert", status_code=status.HTTP_201_CREATED)
def insert_vector(collection: str, req: VectorInsertRequest):
    """Inserts a single embedding with associated metadata."""
    svc = _get_service_for_collection(collection)
    try:
        svc.insert(req.embedding, req.file_path, req.metadata or {})
        return {"status": "ok", "id": req.file_path}
    except Exception as e:
        logger.error(f"Insert failed: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to insert vector.")

@router.post("/{collection}/query", response_model=VectorQueryResponse)
def query_vectors(collection: str, req: VectorQueryRequest):
    """Performs semantic search across the specified collection."""
    svc = _get_service_for_collection(collection)
    
    try:
        # 1. Generate Query Embedding
        chunk = ChunkInput(text=req.text, metadata={})
        embedding_res = embedding_service.process_embeddings(req.model_name, [chunk])
        
        if not embedding_res.results:
            raise ValueError("Embedding service returned no results for the query.")
            
        query_vector = embedding_res.results[0].vector
        
        # 2. Perform Vector Search
        raw_hits = svc.query(query_vector, req.k)
        
        # 3. Standardize Output for Frontend
        formatted_results = []
        for hit in (raw_hits or []):
            metadata = hit.get("metadata", {})
            
            # Prioritize 'text' in metadata, fallback to Chroma's 'document' field
            content = metadata.get("text") or hit.get("document") or "No text content available"
            
            formatted_results.append({
                "score": hit.get("score", 0.0),
                "text": content,
                "metadata": metadata 
            })

        return VectorQueryResponse(results=formatted_results)

    except Exception as e:
        logger.exception(f"Query Error for collection {collection}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Semantic search failed: {str(e)}"
        )