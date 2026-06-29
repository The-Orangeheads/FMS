from app.schemas import ChunkInput, EmbeddingOutput, EmbeddingResponse
from app.core.embedding import *
from typing import List, Dict, Any
import re
import time

class EmbeddingService:
    def __init__(self):
        self.loaded_models: Dict[str, EmbeddingModelInterface] = {} # These are models loaded into the ram
        
        # Configuration Registry: Map friendly names to actual HuggingFace IDs and Recipe Classes
        # We here include all of the models we have to offer
        self.model_registry = {
            "bge-m3": {
                "class": SBERTModel, 
                "id": "BAAI/bge-m3",
                "capabilities": ["text"],
                "languages": ["en", "multi"]
            },
            "paraphrase-multilingual": {
                "class": SBERTModel, 
                "id": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                "capabilities": ["text"],
                "languages": ["multi"]
            },
            "distiluse-multilingual": {
                "class": SBERTModel, 
                "id": "sentence-transformers/distiluse-base-multilingual-cased-v2",
                "capabilities": ["text"],
                "languages": ["multi"]
            },
            "arabic-sbert": {
                "class": SBERTModel, 
                "id": "akhooli/Arabic-SBERT-100k",
                "capabilities": ["text"],
                "languages": ["ar"]
            },
            "arabic-minilm": {
                "class": SBERTModel, 
                "id": "Omartificial-Intelligence-Space/Arabic-MiniLM-L12-v2-all-nli-triplet",
                "capabilities": ["text"],
                "languages": ["ar"]
            },
            "siglip2": {
                "class": SiglipModel, 
                "id": "google/siglip2-base-patch16-512",
                "capabilities": ["text", "image"],
                "languages": ["en"]
            }
        }
        
    def _detect_language(self, text: str) -> str:
        """Simple Unicode-based language detection for Arabic vs English."""
        # Arabic Unicode block is 0600-06FF
        if re.search(r'[\u0600-\u06FF]', text):
            return "ar"
        return "en"

    def get_best_model(self, chunks: List[ChunkInput]) -> str:
        """
        Smart Routing Logic:
        - If any chunk contains an image -> use 'siglip2'
        - If text is Arabic -> use 'arabic-sbert'
        - Default -> 'bge-m3'
        """
        has_image = any(c.image_base64 for c in chunks)
        if has_image:
            return "siglip2"
        
        first_text = next((c.text for c in chunks if c.text), "")
        if self._detect_language(first_text) == "ar":
            return "arabic-sbert"
            
        return "bge-m3"

    def get_capabilities(self) -> Dict[str, Any]:
        """Returns metadata for the Frontend to build its UI dynamically."""
        models_info = []
        for k, v in self.model_registry.items():
            models_info.append({
                "key": k,
                "capabilities": v.get("capabilities", ["text"]), 
                "languages": v.get("languages", v.get("langs", ["en"]))
            })

        return {
            "models": models_info,
            "strategies": ["fixed", "recursive"],
            "databases": ["Chroma"]
        }
        
    def get_query_embedding(self, text: str, model_name: str) -> List[float]:
        """
        Embeds a single query string. Handles the 'auto' routing logic.
        """
        print(f"--- INCOMING QUERY | Model: '{model_name}' | Text: '{text[:20]}' ---")
        
        actual_model_key = model_name
        
        if model_name.lower() == "auto":
            # is_arabic = bool(re.search(r'[\u0600-\u06FF]', text))
            # if is_arabic:
            #     actual_model_key = "arabic-sbert"
            # else:
            #     actual_model_key = "bge-m3"
            
            actual_model_key = "bge-m3"
            print(f"DEBUG: Auto-routing defaulted to Multilingual: {actual_model_key}")

        model = self._get_model(actual_model_key)
        
        from app.schemas import ChunkInput
        fake_chunk = ChunkInput(text=text.strip(), metadata={})
        
        vectors = model.embed([fake_chunk]) 
        return vectors[0]

    def _get_model(self, model_key: str) -> EmbeddingModelInterface:
        """Lazy loads the model only when requested."""
        
        if model_key == "auto":
            model_key = "bge-m3"
        
        if model_key not in self.model_registry:
            raise ValueError(f"Model '{model_key}' not found in registry.") # This means model requested doesn't exist
        
        if model_key not in self.loaded_models: # This loads the model into the ram
            print(f"Loading model: {model_key}...")
            config = self.model_registry[model_key]
            model_class = config["class"]
            hf_id = config["id"]
            self.loaded_models[model_key] = model_class(hf_id)
            print(f"Model {model_key} loaded.")
            
        return self.loaded_models[model_key]

    def clear_all_models(self):
        """Clears all loaded models from memory to force a reload on the next query."""
        self.loaded_models.clear()
        import gc
        import torch
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("All models cleared from memory.")

    def process_embeddings(self, model_name: str, chunks: List[ChunkInput], notify_cb=None, display_name: str = "", startPercent: int=0, endPercent: int=0) -> EmbeddingResponse:
        start_time = time.time()
        
        effective_model_key = model_name
        if model_name.lower() == "auto":
            # --- COMMENTED OUT ARABIC ROUTING FOR INGESTION ---
            # effective_model_key = self.get_best_model(chunks)
            
            effective_model_key = "bge-m3"
            print(f"DEBUG: Ingestion Auto-routing to Multilingual: {effective_model_key}")
        
        model = self._get_model(effective_model_key)
        vectors = model.embed(chunks, notify_cb, display_name, startPercent, endPercent)
        
        results = []
        for i, vector in enumerate(vectors):
            results.append(EmbeddingOutput(
                vector=vector,
                metadata=chunks[i].metadata
            ))
            
        duration = (time.time() - start_time) * 1000 
        
        return EmbeddingResponse(
            results=results,
            processing_time_ms=duration
        )

# Instantiate a global service
embedding_service = EmbeddingService() # This is a singleton design pattern, this ensures that the models are only included once.