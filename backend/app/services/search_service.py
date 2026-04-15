from app.services.embedding_service import embedding_service
from app.services.vector_db_service import documents_db_service
from app.core.config import settings
from app.core.embedding import reranker
import math, os, time


DISPLAY_SHIFT = -5.0   # logit at which you want to show ~50%
DISPLAY_TEMP  =  1.5   # spread of the display curve
LOGIT_FLOOR = -9.5


# how many characters of each candidate to use
# in the reranker input (longer may give better scores but costs more)
MAX_CANDIDATE_CHARS = 800 

class SearchService:
    def __init__(self, collection, threshold, top_k):
        self.collection = collection
        self.threshold = threshold
        self.top_k = top_k
        
    def calibrate_scores(self, raw_logit: float) -> float | None:
        if raw_logit < LOGIT_FLOOR:
            return None
        return 1 / (1 + math.exp(-((raw_logit - DISPLAY_SHIFT) / DISPLAY_TEMP)))
    
    def collect_unique_candidates(self, query):
        query_embedding = embedding_service.get_query_embedding(query, model_name="auto")
        results = self.collection.query(query_embedding, self.top_k * 3) 
        
        seen = {}
        for r in results:
            path = r["metadata"].get("path", "unknown")
            if path not in seen:
                seen[path] = r
         
        return list(seen.values())[:self.top_k]

    def rerank_candidates(self, query, unique):
        if not unique:
            return []
        
        candidates = [r["document"][:MAX_CANDIDATE_CHARS] for r in unique]
        metadata = [r["metadata"] for r in unique]
        # model = embedding_service._get_model("bge-m3")
        # scores = model.compute_hybrid_score(query, candidates)
        
        t0 = time.time()
        logits = reranker.rerank(query, candidates)
        print(f"Reranker: {len(candidates)} candidates in {time.time() - t0:.2f}s")
        
        reranked = []
        for i in range(len(candidates)):
            score = self.calibrate_scores(logits[i])
            if score is None or score < self.threshold:
                continue
            reranked.append({
                "document": candidates[i],
                "metadata": metadata[i],
                "score": score,
                "type": "text",
            })
        
        return sorted(reranked, key=lambda x: x["score"], reverse=True)

    def raw_candidates_to_results(self, unique):
        raw_results = []
        for candidate in unique:
            score = candidate.get("score", 0.0)
            if score is None:
                continue
            raw_results.append({
                "document": candidate.get("document", ""),
                "metadata": candidate.get("metadata", {}),
                "score": max(0.0, min(1.0, float(score))),
                "type": "text",
          })
        return sorted(raw_results, key=lambda x: x["score"], reverse=True)[:self.top_k]

    def search(self, query, rerank: bool = True):
        unique = self.collect_unique_candidates(query)
        if rerank:
            return self.rerank_candidates(query, unique)
        return self.raw_candidates_to_results(unique)

search_service = SearchService(documents_db_service, settings.search_threshold, settings.top_k)