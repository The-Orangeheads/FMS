from app.services.embedding_service import embedding_service
from app.services.vector_db_service import documents_db_service
from app.core.config import settings
from app.core.embedding import reranker
import math

class SearchService:
    def __init__(self, collection, threshold, top_k):
        self.collection = collection
        self.threshold = threshold
        self.top_k = top_k
        
    def calibrate_scores(self, raw_score: float) -> float:
        return 1 / (1 + math.exp(-raw_score))
    
    def search(self, query):
        query_embedding = embedding_service.get_query_embedding(query, model_name="auto")
        results = self.collection.query(query_embedding, self.top_k) 
        candidates = [r["document"] for r in results]
        metadata   = [r["metadata"] for r in results]
        # model = embedding_service._get_model("bge-m3")
        # scores = model.compute_hybrid_score(query, candidates)
        hybrid_score = reranker.rerank(query, candidates)
        
        reranked = [
            {
                "document": candidates[i], "score": self.calibrate_scores(hybrid_score[i]), "metadata": metadata[i]
            }
            for i in range(len(candidates)) if hybrid_score[i] >= self.threshold
        ]
        
        return sorted(reranked, key=lambda x: x["score"], reverse=True)
        
        

search_service = SearchService(documents_db_service, settings.search_threshold, settings.top_k)