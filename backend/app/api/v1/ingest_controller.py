import logging
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status

from app.services.vector_db_service import documents_db_service 
from app.services.embedding import embedding_service 
from app.schemas import ChunkInput 
from app.services.file_service import FileService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ingest", tags=["ingestion"])
file_service = FileService()

@router.post("", status_code=status.HTTP_201_CREATED)
async def ingest_file(
    file: UploadFile = File(...),
    chunk_strategy: str = Form("fixed"),
    chunk_size: int = Form(500),
    chunk_overlap: int = Form(50),
    include_metadata: bool = Form(True)
):
    file_path = None
    
    try:
        if chunk_size <= chunk_overlap:
            raise HTTPException(status_code=400, detail="Size must be > overlap.")

        file_path = await file_service.save_upload(file)
        
        result_chunks = file_service.process_and_chunk(
            file_path=file_path,
            filename=file.filename,
            strategy=chunk_strategy,
            chunk_size=chunk_size,       
            overlap=chunk_overlap,       
            include_metadata=include_metadata
        )

        inputs = [ChunkInput(text=c['text'], metadata=c.get('metadata', {})) for c in result_chunks]
        embedded_data = embedding_service.process_embeddings("bge-m3", inputs)

        for idx, item in enumerate(embedded_data.results):
            text_content = getattr(item, 'text', result_chunks[idx]['text'])
            documents_db_service.insert(
                embedding=item.vector, 
                file_path=f"{file.filename}_{idx}", 
                metadata={
                    **(item.metadata or {}), 
                    "text": text_content,
                    "filename": file.filename
                } 
            )
            
        return {"status": "success", "total_chunks": len(result_chunks)}

    except Exception as e:
        logger.error(f"Ingestion failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"Temporary file deleted: {file_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to delete temp file {file_path}: {cleanup_error}")