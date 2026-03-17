from typing import Dict, Any, List, Optional
import logging
from fastapi import APIRouter, HTTPException, status
import traceback
from uuid import uuid4

import chromadb.errors
from app.core.config import settings
from app.services import vector_db_service
from app.services.vector_db_service import images_db_service, documents_db_service
from app.core.vector_db import ChromaDBImpl
from app.schemas import VectorInsertRequest, VectorQueryRequest, VectorQueryResponse, ChunkInput
from app.services.embedding import embedding_service

# initialize logging
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/vectors", tags=["vectors"])

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
    try:
        logger.info(f"🔍 RRF Unified Search with Threshold: {request.text}")
        chunk_input = ChunkInput(text=request.text)
        fetch_k = request.k * 3 
        
        # text searge with BGE-M3 
        doc_emb_res = embedding_service.process_embeddings("bge-m3", [chunk_input])
        raw_doc_hits = COLLECTION_MAP["documents"].query(doc_emb_res.results[0].vector, k=fetch_k)
        
        doc_results = []
        for hit in (raw_doc_hits or []):
            meta = hit.get("metadata", {})
            raw_text = hit.get("document") or meta.get("text") or ""
            clean_text = " ".join(raw_text.split()).strip()
            
            # remove junk/whitespace
            if not clean_text or len(clean_text) < 5:
                continue
                
            doc_results.append({
                "id": hit.get("id") or f"doc_{uuid4().hex[:6]}",
                "score": hit.get("score", 0.0),
                "text": clean_text,
                "type": "text",
                "sourceFile": meta.get("filename") or "Unknown",
                "metadata": meta
            })

        # image search with SigLIP 2
        img_emb_res = embedding_service.process_embeddings("siglip2", [chunk_input])
        raw_img_hits = COLLECTION_MAP["images"].query(img_emb_res.results[0].vector, k=fetch_k)
        
        img_results = []
        for hit in (raw_img_hits or []):
            score = hit.get("score", 0.0)
            meta = hit.get("metadata", {})

            # Skip if less than 10% match
            if score < 0.10:
                continue

            if not meta.get("storage_path"):
                continue

            img_results.append({
                "id": hit.get("id") or f"img_{uuid4().hex[:6]}",
                "score": score,
                "type": "image",
                "imagePath": meta.get("storage_path"), 
                "sourceFile": meta.get("filename") or "Unknown",
                "metadata": meta
            })

        # RECIPROCAL RANK FUSION (RRF)
        rrf_scores = {} 
        final_map = {}  
        
        for rank, item in enumerate(doc_results):
            item_id = item["id"]
            rrf_scores[item_id] = rrf_scores.get(item_id, 0) + (1.0 / (60 + rank))
            final_map[item_id] = item

        for rank, item in enumerate(img_results):
            item_id = item["id"]
            rrf_scores[item_id] = rrf_scores.get(item_id, 0) + (1.0 / (60 + rank))
            if item_id not in final_map:
                final_map[item_id] = item

        combined_results = []
        for item_id, rrf_score in rrf_scores.items():
            item = final_map[item_id]
            item["rrf_rank"] = rrf_score 
            combined_results.append(item)

        combined_results.sort(key=lambda x: x["rrf_rank"], reverse=True)

        return {"results": combined_results[:request.k]}

    except Exception as e:
        logger.error(f"Unified Query Failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    

# Separate router for clearing database
clear_router = APIRouter(prefix="/api/v1/vector-db", tags=["vector-db"])

@clear_router.delete("/{db_type}/clear")
async def clear_vector_db(db_type: str):
    if db_type.lower() not in ("chroma", "chromadb"):
        raise HTTPException(status_code=400, detail=f"Unknown db type: {db_type}")
    
    db_path = settings.VECTOR_DB_PATH
    try:
        # Reset the persistent client
        documents_db_service.client.reset() 

        # Re-initialize services
        new_docs_svc = ChromaDBImpl(db_path, "documents")
        new_imgs_svc = ChromaDBImpl(db_path, "images")

        # Update global state
        vector_db_service.documents_db_service = new_docs_svc
        vector_db_service.images_db_service = new_imgs_svc

        # Sync the mapping
        COLLECTION_MAP["documents"] = new_docs_svc
        COLLECTION_MAP["images"] = new_imgs_svc

        logger.info("✅ Database reset and collections re-initialized.")
        return {"status": "ok", "message": "Database cleared. Re-ingest your files."}
        
    except Exception as e:
        logger.exception(f"Clear DB failed: {e}")
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
                "text": hit.get("document") or hit.get("metadata", {}).get("text") or "No text content",
                "metadata": hit.get("metadata", {}) 
            })

        return VectorQueryResponse(results=formatted_results)

    except Exception as e:
        logger.exception(f"Query Error for {collection}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))