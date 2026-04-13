import logging
from fastapi import APIRouter, HTTPException
import traceback
from app.core.config import settings
from app.schemas import DuplicatesPage
from services.files_db_service import files_db_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/duplicates", tags=["duplicates"])

@router.get("/get_dupes")
async def get_dupes(page: int) -> DuplicatesPage:
    try:
        nodes, edges = files_db_service.get_page(page)
        return DuplicatesPage(
            nodes=nodes,
            edges=edges
        )

    except Exception as e:
        logger.error(f"Getting duplicate page failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))