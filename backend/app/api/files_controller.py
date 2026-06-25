"""
Serves uploaded files for display in the UI
"""

import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings
from app.services.files_db_service import files_db_service
router = APIRouter(prefix="/api/files", tags=["files"])

def _validate_filename(filename: str) -> bool:
    """Prevent path traversal; allow only safe filenames."""
    if not filename or filename.strip() != filename:
        return False
    if ".." in filename or "/" in filename or "\\" in filename:
        return False
    return True

@router.get("/directories")
async def get_directories():
    """
    Returns a list of all unique tracked directories.
    Used by the frontend UI to populate the exclusion filter checkboxes.
    """
    directories = files_db_service.get_all_directories()
    return {"directories": directories}
@router.get("/display/{filename}")
async def display_file(filename: str):
    """
    Serve a persisted image file by its storage filename.
    Used by unified search results to show image previews.
    """
    if not _validate_filename(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    file_path = os.path.join(settings.UPLOADS_IMAGES_DIR, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type=None)

