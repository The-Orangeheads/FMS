from app.core.files_db import FilesDB
from app.core.config import settings

files_db_service = FilesDB(settings.DATA_DIR)