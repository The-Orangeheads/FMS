from fastapi import APIRouter
from app.services.embedding_service import embedding_service
from app.core.config import settings, update_settings

router = APIRouter(prefix="/config", tags=["config"])

@router.get("")
async def get_system_config():
    """
    Returns the system capabilities including available models, 
    chunking strategies, and supported databases.
    """
    
    return embedding_service.get_capabilities()

@router.post("")
async def set_system_config(config: dict):
    """
    Updates the system configuration based on the provided settings.
    This can include changing the embedding model, chunking strategy, 
    or database backend.
    """
    old_quantized = settings.use_quantized_models
    
    update_settings(config)
    
    # If the quantization setting changed, force the models to reload next time they are used
    if "use_quantized_models" in config and old_quantized != settings.use_quantized_models:
        embedding_service.clear_all_models()
        
    return {"message": "Configuration updated successfully."}