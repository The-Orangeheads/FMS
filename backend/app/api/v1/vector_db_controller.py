from typing import Dict, Any, List, Optional
import logging
from fastapi import APIRouter, HTTPException, status
import traceback

from app.services.vector_db_service import images_db_service, documents_db_service
from app.core.vector_db import ChromaDBImpl
from app.schemas import VectorInsertRequest, VectorQueryRequest, VectorQueryResponse, ChunkInput
from app.services.embedding import embedding_service

# Initialize logging
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/vectors", tags=["vectors"])

# Collection mapping
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

@router.post("/unified/query")
async def unified_query(request: VectorQueryRequest):
    """
    Searches BOTH Text and Image collections simultaneously.
    URL: POST /api/v1/vectors/unified/query
    """
    try:
        logger.info(f"Starting UNIFIED search for: {request.text}")
        chunk_input = ChunkInput(text=request.text)
        
        # 1. Search Text Library (BGE-M3)
        doc_emb_res = embedding_service.process_embeddings("bge-m3", [chunk_input])
        doc_vector = doc_emb_res.results[0].vector
        
        # Using .query instead of .search
        raw_doc_hits = documents_db_service.query(doc_vector, k=request.k)
        
        # Format Document results
        doc_results = []
        for hit in (raw_doc_hits or []):
            doc_results.append({
                "score": hit.get("score", 0.0),
                "text": hit.get("metadata", {}).get("text") or hit.get("document") or "No text content",
                "type": "text",
                "sourceFile": hit.get("metadata", {}).get("filename") or "Unknown",
                "metadata": hit.get("metadata", {})
            })

        # 2. Search Image Library (SigLIP 2)
        img_emb_res = embedding_service.process_embeddings("siglip2", [chunk_input])
        img_vector = img_emb_res.results[0].vector

        # Using .query instead of .search
        raw_img_hits = images_db_service.query(img_vector, k=request.k)
        
        # Format Image results
        img_results = []
        for hit in (raw_img_hits or []):
            img_results.append({
                "score": hit.get("score", 0.0),
                "type": "image",
                "imagePath": hit.get("metadata", {}).get("filename"),
                "sourceFile": hit.get("metadata", {}).get("filename") or "Unknown",
                "metadata": hit.get("metadata", {})
            })

        # 3. Combine and Sort by score (Highest first)
        all_matches = doc_results + img_results
        all_matches.sort(key=lambda x: x.get("score", 0), reverse=True)
        
        return {"results": all_matches[:request.k]}

    except Exception as e:
        logger.error(f"Unified Query Failed: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    

@router.post("/{collection}/insert", status_code=status.HTTP_201_CREATED)
def insert_vector(collection: str, req: VectorInsertRequest):
    svc = _get_service_for_collection(collection)
    try:
        svc.insert(req.embedding, req.file_path, req.metadata or {})
        return {"status": "ok", "id": req.file_path}
    except Exception as e:
        logger.error(f"Insert failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to insert vector.")

@router.post("/{collection}/query", response_model=VectorQueryResponse)
def query_vectors(collection: str, req: VectorQueryRequest):
    """Standard single-collection search (Legacy/Specific)."""
    # This will catch 'documents' or 'images' specifically
    svc = _get_service_for_collection(collection)
    
    try:
        chunk = ChunkInput(text=req.text, metadata={})
        embedding_res = embedding_service.process_embeddings(req.model_name, [chunk])
        
        if not embedding_res.results:
            raise ValueError("Embedding service returned no results")
            
        query_vector = embedding_res.results[0].vector
        raw_hits = svc.query(query_vector, req.k)
        
        formatted_results = []
        for hit in (raw_hits or []):
            formatted_results.append({
                "score": hit.get("score", 0.0),
                "text": hit.get("metadata", {}).get("text") or "No text",
                "metadata": hit.get("metadata", {}) 
            })

        return VectorQueryResponse(results=formatted_results)

    except Exception as e:
        logger.exception(f"Query Error for {collection}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))