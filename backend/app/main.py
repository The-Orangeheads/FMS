from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from typing import List
import uvicorn
from app.core.config import settings
from app.api.v1.vector_db_controller import router as vector_db_router
from app.api.v1.embedding_controller import router as embedding_router

from app.services.file_service import FileService

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.API_VERSION,
    description="AI-Powered File Management System"
)

app.include_router(vector_db_router)
app.include_router(embedding_router)
file_service = FileService()

@app.get("/")
async def root():
    return {
        "status": "running",
        "project": settings.PROJECT_NAME,
        "version": settings.API_VERSION
    }

@app.post("/ingest")
async def ingest_file(
    file: UploadFile = File(...),
    chunk_strategy: str = Form("fixed"),
    chunk_size: int = Form(500),
    chunk_overlap: int = Form(50),
    include_metadata: bool = Form(True)
):
    """
    Ingest a file with specific chunking settings.
    """
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

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)