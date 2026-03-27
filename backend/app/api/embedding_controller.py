from fastapi import APIRouter, HTTPException, Depends
from app.schemas import EmbeddingRequest, EmbeddingResponse
from app.services.embedding_service import embedding_service

router = APIRouter(prefix="/embedding", tags=["Embedding"])

@router.post("/embed", response_model=EmbeddingResponse)
def create_embeddings(request: EmbeddingRequest):
    """
    Receives text chunks or images, and returns vectors with metadata.
    """
    try:
        # Pass data to the service layer
        response = embedding_service.process_embeddings(
            model_name=request.model_name,
            chunks=request.chunks
        )
        return response
    
    except ValueError as e:
        # Handle case where model name is invalid
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Handle unexpected errors (e.g., CUDA OOM, format errors)
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")
