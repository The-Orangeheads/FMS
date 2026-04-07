from fastapi import APIRouter, Response, status
from app.services.filesync_service import file_syncer
from fastapi.responses import JSONResponse
from app.schemas import DirectoryReq, DirectoryListRes

router = APIRouter(tags=["files"], prefix="/api/directory")

@router.post("/sync")
async def initiate_sync():
    try:
        await file_syncer.initiate_sync()
        return Response(status_code=status.HTTP_200_OK)
    except Exception as e:
        return Response(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Internal Error: {str(e)}")
    
@router.get("/paths")
async def get_directories():
    try:
        return DirectoryListRes(dirs=file_syncer.get_dirs())
    except Exception as e:
        return Response(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Internal Error: {str(e)}")

@router.post("/paths")
async def add_directory(req : DirectoryReq):
    try:
        file_syncer.add_dir(req.path)
        return Response(status_code=status.HTTP_200_OK)
    except Exception as e:
        return Response(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Internal Error: {str(e)}")

@router.delete("/paths")
async def remove_directory(req : DirectoryReq):
    try:
        file_syncer.rem_dir(req.path)
        return Response(status_code=status.HTTP_200_OK)
    except Exception as e:
        return Response(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Internal Error: {str(e)}")
