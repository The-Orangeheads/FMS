import logging
from fastapi import APIRouter, Response, status, HTTPException
import traceback

from app.schemas import DuplicatesPage
from app.services.files_db_service import files_db_service
from app.services.filesync_service import file_syncer
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/duplicates", tags=["duplicates"])

@router.get("/get_dupes")
async def get_dupes(page: int) -> DuplicatesPage:
    try:
        nodes, edges = files_db_service.get_page(page, 20, 20)
        return DuplicatesPage(
            nodes=nodes,
            edges=edges
        )

    except Exception as e:
        logger.error(f"Getting duplicate page failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/dupe_sync")
async def dupe_sync():
    try:
        file_syncer.force_dd_sync()
        return Response(status_code=status.HTTP_200_OK)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": f"Internal Error: {str(e)}"},
        )