import logging
import os
import base64
import shutil
import re
from uuid import uuid4
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status

from app.core.config import settings
from app.services import vector_db_service
from app.services.embedding_service import embedding_service
from app.schemas import ChunkInput
from app.services.file_service import FileService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ingest", tags=["ingestion"])
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
        
        # IMAGE PROCESSING
        if file.content_type.startswith("image/"):
            logger.info(f"Detected image upload: {file.filename}")
            
            # 1. Read and Encode Image to Base64
            with open(file_path, "rb") as f:
                image_bytes = f.read()
                image_b64 = base64.b64encode(image_bytes).decode('utf-8')
            
            # 2. Persist image for display (uploads/images/{uuid}_{safe_filename})
            safe_name = re.sub(r'[^\w\-_.]', '_', file.filename)
            storage_filename = f"{uuid4().hex}_{safe_name}"
            storage_path = os.path.join(settings.UPLOADS_IMAGES_DIR, storage_filename)
            shutil.copy2(file_path, storage_path)
            
            # 3. Prepare Input for SigLIP (No chunking needed for single images)
            inputs = [ChunkInput(
                text=None,
                image_base64=image_b64,
                metadata={"filename": file.filename, "content_type": file.content_type}
            )]
            
            # 4. Embed using SigLIP 2 explicitly
            embedded_data = embedding_service.process_embeddings("siglip2", inputs)
            
            # 5. Store in IMAGES Collection (storage_filename used for display endpoint)
            for idx, item in enumerate(embedded_data.results):
                vector_db_service.images_db_service.insert(
                    embedding=item.vector,
                    file_path=file.filename,
                    metadata={
                        **(item.metadata or {}),
                        "filename": file.filename,
                        "storage_path": storage_filename,
                        "type": "image"
                    }
                )
            
            return {
                "status": "success", 
                "type": "image", 
                "model": "siglip2", 
                "message": "Image embedded and stored successfully."
            }

        # TEXT/DOCUMENT PROCESSING
        else:
            logger.info(f"Detected text/document upload: {file.filename}")
            target_model = "bge-m3" if model_name == "auto" else model_name
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
            valid_inputs = []
            valid_raw_chunks = []

            for chunk in result_chunks:
                clean_text = " ".join(chunk['text'].split())
                # Only keep chunks that have actual alphanumeric characters and are longer than 5 chars
                if len(clean_text) > 5 and any(char.isalnum() for char in clean_text):
                    chunk['text'] = clean_text # Update with the cleaned version
                    valid_inputs.append(ChunkInput(text=clean_text, metadata=chunk.get('metadata', {})))
                    valid_raw_chunks.append(chunk)

            if not valid_inputs:
                logger.warning(f"File {file.filename} resulted in 0 valid chunks after filtering.")
                return {"status": "skipped", "message": "No meaningful text found in file."}

            # 3. Embed using ONLY the valid data
            embedded_data = embedding_service.process_embeddings(target_model, valid_inputs)

            # 4. Store in DOCUMENTS
            for idx, item in enumerate(embedded_data.results):
                # Use valid_raw_chunks instead of result_chunks to keep indices aligned
                text_content = valid_raw_chunks[idx]['text']
                vector_db_service.documents_db_service.insert(
                    embedding=item.vector, 
                    file_path=f"{file.filename}_{idx}", 
                    content=text_content,
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