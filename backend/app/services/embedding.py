import time
from typing import List, Dict, Any
from app.schemas import ChunkInput, EmbeddingOutput, EmbeddingResponse
import re
from typing import List, Dict, Any, Optional

# --- Model Imports ---
# You will need: pip install sentence-transformers transformers torch pillow
from sentence_transformers import SentenceTransformer
from transformers import AutoModel, AutoProcessor
import torch
from PIL import Image
import io
import base64


"""
This ensures that every model we have has a function called `embed`, that function is called
and expected to return a list of vectors (a list of lists) and is expected to take a list of chunks
as inputs, that raise notImplementedError is just there to ensure that no one uses this interface as
an embedding model, it's just there for other classes to extend on and implement the embed function 
according to their structure for example embedding in Siglip models is different than SBERT models.

So it just standardizes models so that all models look alike from outside, they all take the same 
things and output the same things
"""
class EmbeddingModelInterface:
    """Base class to enforce a common structure for all model recipes."""
    def embed(self, chunks: List[ChunkInput]) -> List[List[float]]:
        raise NotImplementedError

# --- RECIPE 1: Standard Sentence Transformers (Text Only) ---
class SBERTModel(EmbeddingModelInterface):
    """
    This __init__ function just loads the model, there are safety checks implemented to ensure
    that the model isn't downloaded twice, if it's downloaded it's there in your chache files
    then you won't have to download the weights again. You'll only have to download it the first
    time you use the model.
    """
    def __init__(self, model_name: str):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = SentenceTransformer(model_name, device=self.device)
        print(f"SBERT Model loaded on device: {self.device}")

    """
    This is the function from the interface above, we override it here. It takes a list of chunks
    and is expected to return a list of vectors, but as we know SBERT like models deal with text
    so that's why we extract the chunks' text into a variable called texts.
    """
    def embed(self, chunks: List[ChunkInput]) -> List[List[float]]:
        texts = [c.text if hasattr(c, 'text') else str(c) for c in chunks]
        if not texts:
            return []
        """
        The model.encode function is the one where text is actually converted into vectors
        the convert_to_tensor parameter is responsible for making the data in a form that's possible
        to process over the GPU, we have to have CUDA enabled for the models for it to actually use
        the GPU itself.

        The cpu().tolist() function is responsible for converting the resulting vectors into a python
        list so that it's possible to save as JSON and sent over the API.
        """

        # Log token counts to see variance
        token_counts = [len(self.model.tokenizer.encode(text)) for text in texts]
        print(f"Token counts: min={min(token_counts)}, max={max(token_counts)}, avg={sum(token_counts)/len(token_counts):.1f}")

        # for batching, similar chunk sizes are recommended per batch (sorting may help if not equal sizes)

        embeddings = self.model.encode(
            texts, 
            convert_to_tensor=True,
            show_progress_bar=True,  # To show progress in console
            batch_size=1,
            normalize_embeddings=True  # normalize for cosine similarity
        )

        return embeddings.cpu().tolist()

"""
The next part is longer because it deals with models like SigLip. Models that actually deal with
text and images, converts them into the same language (vectors). So the encoding process is a bit
longer here.
"""

# --- RECIPE 2: SigLIP 2 (Multimodal: Text & Image) ---
class SiglipModel(EmbeddingModelInterface):
    def __init__(self, model_id: str):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor = AutoProcessor.from_pretrained(model_id)
        self.model = AutoModel.from_pretrained(model_id).to(self.device).eval()
        print(f"Siglip Model loaded on device: {self.device}")

        self.logit_scale = self.model.logit_scale.exp().item()
        self.logit_bias = self.model.logit_bias.item()
    
    def _to_embedding_tensor(self, outputs):
        """
        Normalize the many possible output shapes/types into a 2D tensor:
        (batch_size, hidden_dim)
        """
        if torch.is_tensor(outputs):
            return outputs

        # Most robust for HF ModelOutput objects
        if hasattr(outputs, "text_embeds") and outputs.text_embeds is not None:
            return outputs.text_embeds
        if hasattr(outputs, "image_embeds") and outputs.image_embeds is not None:
            return outputs.image_embeds
        if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
            return outputs.pooler_output

        # Fallback for tuple-like outputs
        if isinstance(outputs, (tuple, list)) and len(outputs) > 0:
            first = outputs[0]
            if torch.is_tensor(first):
                return first
            if hasattr(first, "pooler_output") and first.pooler_output is not None:
                return first.pooler_output

        raise TypeError(f"Unsupported SigLIP2 output type: {type(outputs)!r}")

    @torch.no_grad()
    def embed(self, chunks: List[ChunkInput]) -> List[List[float]]:
        embeddings: List[List[float]] = []

        for chunk in chunks:
            if chunk.image_base64:
                image_data = base64.b64decode(chunk.image_base64)
                image = Image.open(io.BytesIO(image_data)).convert("RGB")

                inputs = self.processor(images=image, return_tensors="pt").to(self.device)
                outputs = self.model.get_image_features(**inputs)

            elif chunk.text:
                inputs = self.processor(
                    text=[chunk.text],
                    return_tensors="pt",
                    padding="max_length",
                    max_length=64,
                    truncation=True,
                ).to(self.device)
                outputs = self.model.get_text_features(**inputs)

            else:
                continue

            vec = self._to_embedding_tensor(outputs)

            # L2-normalize for retrieval / cosine similarity
            vec = vec / vec.norm(p=2, dim=-1, keepdim=True)

            embeddings.append(vec.squeeze(0).cpu().tolist())

        return embeddings

# --- SERVICE CLASS ---

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

    def process_embeddings(self, model_name: str, chunks: List[ChunkInput]) -> EmbeddingResponse:
        start_time = time.time()
        
        effective_model_key = model_name
        if model_name.lower() == "auto":
            # --- COMMENTED OUT ARABIC ROUTING FOR INGESTION ---
            # effective_model_key = self.get_best_model(chunks)
            
            effective_model_key = "bge-m3"
            print(f"DEBUG: Ingestion Auto-routing to Multilingual: {effective_model_key}")
        
        model = self._get_model(effective_model_key)
        # Inside process_embeddings...
        vectors = model.embed(chunks)
        
        results = []
        for i, vector in enumerate(vectors):
            results.append(EmbeddingOutput(
                vector=vector,
                metadata=chunks[i].metadata
            ))
            
        duration = (time.time() - start_time) * 1000 
        
        return EmbeddingResponse(
            model_used=effective_model_key,
            results=results,
            processing_time_ms=duration
        )

# Instantiate a global service 
embedding_service = EmbeddingService() # This is a singleton design pattern, this ensures that the models are only included once.