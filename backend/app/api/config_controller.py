from fastapi import APIRouter
from app.services.embedding_service import embedding_service

router = APIRouter(prefix="/config", tags=["config"])

@router.get("")
async def get_system_config():
    """
    Returns the system capabilities including available models, 
    chunking strategies, and supported databases.
    """
    
    return embedding_service.get_capabilities()