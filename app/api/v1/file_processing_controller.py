from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.file_service import FileService

# Define the router (This acts like a mini-FastAPI app)
router = APIRouter(
    prefix="/files", 
    tags=["File Processing"]
)

# Initialize the service locally for this controller
file_service = FileService()

@router.post("/ingest")
async def ingest_file(
    file: UploadFile = File(...),
    chunk_strategy: str = Form("fixed"),
    chunk_size: int = Form(500),
    chunk_overlap: int = Form(50),
    include_metadata: bool = Form(True)
):
    allowed_strategies = ["fixed", "recursive"]
    if chunk_strategy not in allowed_strategies:
        raise HTTPException(status_code=400, detail=f"Strategy must be one of {allowed_strategies}")
        
    if chunk_size <= chunk_overlap:
        raise HTTPException(status_code=400, detail="Chunk size must be larger than overlap.")

    try:
        file_path = await file_service.save_upload(file)        
        result_chunks = file_service.process_and_chunk(
            file_path=file_path,
            filename=file.filename,
            strategy=chunk_strategy,
            chunk_size=chunk_size,       
            overlap=chunk_overlap,       
            include_metadata=include_metadata
        )
        
        return {
            "status": "success",
            "config": {
                "strategy": chunk_strategy,
                "size": chunk_size,
                "overlap": chunk_overlap
            },
            "total_chunks": len(result_chunks),
            "chunks": result_chunks 
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))