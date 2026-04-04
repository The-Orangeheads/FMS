from app.core.vector_db import ChromaDBImpl
from app.core.config import settings

images_db_service = ChromaDBImpl(settings.DATA_DIR, "images")
documents_db_service = ChromaDBImpl(settings.DATA_DIR, "documents")