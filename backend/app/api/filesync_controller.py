from fastapi import APIRouter, Response, status
from app.services.filesync_service import file_syncer

router = APIRouter(tags=["files"])

@router.post("/sync")
async def initiate_sync():
    try:
        await file_syncer.initiate_sync()
        return Response(status_code=status.HTTP_200_OK)
    except Exception as e:
        return Response(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Internal Error: {str(e)}")