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
    
    update_settings(config)
    return {"message": "Configuration updated successfully."}