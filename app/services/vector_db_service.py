from app.core.vector_db import ChromaDBImpl
from app.core.config import settings


images_db_service = ChromaDBImpl(settings.VECTOR_DB_PATH, "images")
documents_db_service = ChromaDBImpl(settings.VECTOR_DB_PATH, "documents")