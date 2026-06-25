import logging
from fastapi import APIRouter, HTTPException, status
import traceback
from uuid import uuid4
import torch
from app.core.config import settings
from app.services import vector_db_service
from app.services.vector_db_service import images_db_service, documents_db_service
from app.core.vector_db import ChromaDBImpl
from app.schemas import VectorInsertRequest, VectorQueryRequest, ImgQueryRequest, ChunkInput
from app.services.embedding_service import embedding_service
from app.services.search_service import search_service
import base64

# initialize logging
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vectors", tags=["vectors"])

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

def text_query_with_mode(chunk_input, rerank: bool, excluded_directories: list[str] = None):
    text_model = (settings.DEFAULT_TEXT_EMBEDDING_MODEL
                  if settings.cur_text_embedding_model == "auto"
                  else settings.cur_text_embedding_model)

    results = search_service.search(
        chunk_input.text, 
        rerank=rerank, 
        excluded_directories=excluded_directories
    )
    embedding_service._get_model(text_model).free_vram()

    return results

def image_query(chunk_input, score_correction: bool, excluded_directories: list[str] = None):
    image_model = (settings.DEFAULT_IMAGE_EMBEDDING_MODEL
                    if settings.cur_image_embedding_model == "auto"
                    else settings.cur_image_embedding_model)
    print(image_model)
    img_emb_res = embedding_service.process_embeddings(image_model, [chunk_input])
    
    where_filter = None
    if excluded_directories and len(excluded_directories) > 0:
        where_filter = {"directory": {"$nin": excluded_directories}}
    
    raw_img_hits = COLLECTION_MAP["images"].query(
        img_emb_res.results[0].vector, 
        k=settings.top_k,
        where_filter=where_filter
    )
    model = embedding_service._get_model(image_model)
    results = []

    for hit in (raw_img_hits or []):
        score = hit.get("score", 0.0)
        if score_correction:
            score = score * 100 - 10        # optimize the scale and bias
            score = torch.sigmoid(torch.tensor(score)).item()
        meta = hit.get("metadata", {})
        
        # Skip if less than 10% match
        if score < 0.10:
            continue

        results.append({
            "id": hit.get("id") or f"unknownID_{uuid4().hex[:6]}",
            "score": score,
            "type": "image",
            "metadata": meta
        })
    
    embedding_service._get_model(image_model).free_vram()
    return results

@router.post("/unified/query")
async def unified_query(req: VectorQueryRequest):
    try:
        chunk_input = ChunkInput(text=req.text)
        
        text_results = text_query_with_mode(chunk_input, req.rerank, req.excluded_directories)
        img_results = image_query(chunk_input, True, req.excluded_directories)
        
        results = text_results + img_results
        results = sorted(results, key=lambda x: x.get("score", 0), reverse=True)

        return {"results": results[:settings.top_k], "reranked": req.rerank}

    except Exception as e:
        logger.error(f"Unified Query Failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/image/query")
async def reverse_image_query(req: ImgQueryRequest):
    try:
        with open(req.path, "rb") as f:
            image_bytes = f.read()
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')

        chunk_input = ChunkInput(image_base64=image_b64)
        results = image_query(chunk_input, False, req.excluded_directories)
        results = sorted(results, key=lambda x: x.get("score", 0), reverse=True)

        return {"results": results}
    
    except Exception as e:
        logger.error(f"Image Query Failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Separate router for clearing database
clear_router = APIRouter(prefix="/api/vector-db", tags=["vector-db"])

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
        
        # Sync the mapping
        COLLECTION_MAP["documents"] = new_docs_svc
        COLLECTION_MAP["images"] = new_imgs_svc
        
        # Update global state
        vector_db_service.documents_db_service = new_docs_svc
        vector_db_service.images_db_service = new_imgs_svc

        logger.info("Database reset and collections re-initialized.")
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
