from fastapi import APIRouter, HTTPException
from app.schemas import VectorQueryRequest 
from app.services.embedding import embedding_service
from app.services.vector_db_service import images_db_service, documents_db_service
import traceback

router = APIRouter(prefix="/vectors", tags=["query"])

@router.post("/{collection_name}/query")
async def query_collection(collection_name: str, request: VectorQueryRequest):
    try:
        # 1. Identify which DB service to use based on collection name
        db_service = images_db_service if "image" in collection_name.lower() else documents_db_service

        # 2. Generate the embedding
        # Pass the model_name (could be "auto") to the service logic
        query_vector = embedding_service.get_query_embedding(
            text=request.text, 
            model_name=request.model_name
        )

        # 3. Perform the search (ChromaDBImpl has .query(embedding, k), not .search)
        results = db_service.query(
            embedding=query_vector,
            k=request.k
        )
        
        return {"results": results}

    except Exception as e:
        # REAL-TIME DEBUGGING: This prints the exact line number of the failure in your console
        print("-" * 30)
        print(f"QUERY ERROR: {str(e)}")
        traceback.print_exc() 
        print("-" * 30)
        raise HTTPException(status_code=500, detail=f"Internal Query Error: {str(e)}")