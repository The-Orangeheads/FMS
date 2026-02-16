import logging
import os
import base64
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status

# Ensure you import both DB services
from app.services.vector_db_service import documents_db_service, images_db_service
from app.services.embedding import embedding_service
from app.schemas import ChunkInput
from app.services.file_service import FileService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ingest", tags=["ingestion"])
file_service = FileService()

@router.post("", status_code=status.HTTP_201_CREATED)
async def ingest_file(
    file: UploadFile = File(...),
    model_name: str = Form("auto"),
    chunk_strategy: str = Form("fixed"),
    chunk_size: int = Form(500),
    chunk_overlap: int = Form(50),
    include_metadata: bool = Form(True)
):
    file_path = None
    
    try:
        # 0. Validation
        if chunk_size <= chunk_overlap:
            raise HTTPException(status_code=400, detail="Size must be > overlap.")

        # 1. Save the file temporarily
        file_path = await file_service.save_upload(file)
        
        # --- BRANCH 1: IMAGE PROCESSING ---
        if file.content_type.startswith("image/"):
            logger.info(f"Detected image upload: {file.filename}")
            
            # 1. Read and Encode Image to Base64
            with open(file_path, "rb") as f:
                image_bytes = f.read()
                image_b64 = base64.b64encode(image_bytes).decode('utf-8')
            
            # 2. Prepare Input for SigLIP (No chunking needed for single images)
            inputs = [ChunkInput(
                text=None,
                image_base64=image_b64,
                metadata={"filename": file.filename, "content_type": file.content_type}
            )]
            
            # 3. Embed using SigLIP 2 explicitly
            # We force 'siglip2' because 'bge-m3' cannot understand images
            embedded_data = embedding_service.process_embeddings("siglip2", inputs)
            
            # 4. Store in IMAGES Collection
            for idx, item in enumerate(embedded_data.results):
                images_db_service.insert(
                    embedding=item.vector,
                    file_path=file.filename,
                    metadata={
                        **(item.metadata or {}),
                        "filename": file.filename,
                        "type": "image"
                    }
                )
            
            return {
                "status": "success", 
                "type": "image", 
                "model": "siglip2", 
                "message": "Image embedded and stored successfully."
            }

        # --- BRANCH 2: TEXT/DOCUMENT PROCESSING (Existing Logic) ---
        else:
            logger.info(f"Detected text/document upload: {file.filename}")
            
            # 1. Process and Chunk Text
            result_chunks = file_service.process_and_chunk(
                file_path=file_path,
                filename=file.filename,
                strategy=chunk_strategy,
                chunk_size=chunk_size,       
                overlap=chunk_overlap,       
                include_metadata=include_metadata
            )

            # 2. Prepare Input for Text Model
            inputs = [ChunkInput(text=c['text'], metadata=c.get('metadata', {})) for c in result_chunks]
            
            # 3. Embed using Text Model (Defaulting to BGE-M3 as requested previously)
            # You can switch this back to 'model_name' variable if you want dynamic routing again
            target_model = "bge-m3" if model_name == "auto" else model_name
            embedded_data = embedding_service.process_embeddings(target_model, inputs)

            # 4. Store in DOCUMENTS Collection
            for idx, item in enumerate(embedded_data.results):
                text_content = getattr(item, 'text', result_chunks[idx]['text'])
                documents_db_service.insert(
                    embedding=item.vector, 
                    file_path=f"{file.filename}_{idx}", 
                    metadata={
                        **(item.metadata or {}), 
                        "text": text_content,
                        "filename": file.filename,
                        "type": "text"
                    } 
                )
            
            return {
                "status": "success", 
                "type": "text", 
                "total_chunks": len(result_chunks),
                "model": target_model
            }

    except Exception as e:
        logger.error(f"Ingestion failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Cleanup: Delete the temp file
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"Temporary file deleted: {file_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to delete temp file {file_path}: {cleanup_error}")