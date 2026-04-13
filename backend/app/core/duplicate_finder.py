from app.services.vector_db_service import documents_db_service, images_db_service
from app.core.config import settings

class DuplicateFinder:
    
    def __init__(self):
        pass
    
    def image_similarities(self, embedding):
        return images_db_service.query_similarity(embedding, settings.similarity_threshold)

    def document_similarities(self, embeddings):
        pass
