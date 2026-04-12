from typing import List
from app.schemas import ChunkInput, EmbeddingOutput, EmbeddingResponse
from sentence_transformers import SentenceTransformer, CrossEncoder
from transformers import AutoModel, AutoProcessor
import torch
from PIL import Image
import io
import math
import base64
import os
import threading

from app.core.config import settings


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
    def embed(self, chunks: List[ChunkInput], notify_cb=None) -> List[List[float]]:
        raise NotImplementedError
    
    def free_vram(self):
        raise NotImplementedError
    
    def load_on_vram(self):
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

        if settings.keep_models_in_memory:
            self.model = SentenceTransformer(model_name, device=self.device)
            self.on_vram = (self.device == "cuda")
        else:
            self.model = SentenceTransformer(model_name, device="cpu")
            self.on_vram = False
            
        print(f"SBERT Model loaded on device: {'cuda' if self.on_vram else 'cpu'}")
        self.vram_lock = threading.Lock()
        self.currently_embedding = 0

    def free_vram(self):
        if self.device != "cuda" or settings.keep_models_in_memory:
            return
        with self.vram_lock:
            if (not self.on_vram) or (self.currently_embedding > 0):
                return
            
            self.model = self.model.to("cpu")
            torch.cuda.empty_cache()
            self.on_vram = False
            print(f"SBERT Model loaded on device: cpu")
            
    def load_on_vram(self):
        if self.device != "cuda":
            return
        with self.vram_lock:
            if self.on_vram:
                return
            self.model = self.model.to("cuda")
            self.on_vram = True
            print(f"SBERT Model loaded on device: cuda")

    """
    This is the function from the interface above, we override it here. It takes a list of chunks
    and is expected to return a list of vectors, but as we know SBERT like models deal with text
    so that's why we extract the chunks' text into a variable called texts.
    """
    def embed(self, chunks: List[ChunkInput], notify_cb=None) -> List[List[float]]:
        file_name = os.path.basename(chunks[0].metadata.get("path", "unknown"))

        if notify_cb:
            notify_cb(f"Loading Embedding Model... : {file_name} : 10")
        
        with self.vram_lock:
            self.currently_embedding += 1
        self.load_on_vram()

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

        # Sort by token length and keep track of original indices
        sorted_idxs = sorted(range(len(texts)), key=lambda i: token_counts[i])
        sorted_texts = [texts[i] for i in sorted_idxs]
        
        # Batch encode in sorted order
        batch_size = settings.batch_size
        total_batches = math.ceil(len(sorted_texts) / batch_size)
        sorted_embds = []

        if notify_cb:
            notify_cb(f"Embedded 0 batches out of {total_batches}: {file_name} : 15")

        for batch_index, i in enumerate(range(0, len(sorted_texts), batch_size), start=1):
            cur_batch = sorted_texts[i : i + batch_size]
            
            batch_embeddings = self.model.encode(
                cur_batch,
                convert_to_tensor=True,
                normalize_embeddings=True,
            )

            sorted_embds.extend(batch_embeddings.cpu().tolist())
            
            if notify_cb:
                percentage = 15 + round(batch_index/total_batches * 80)
                notify_cb(f"Embedded {batch_index} batches out of {total_batches}: {file_name} : {percentage}")
            
        # Restore the original batches order
        ordered_embds = [None] * len(texts)
        for sorted_pos, original_idx in enumerate(sorted_idxs):
            ordered_embds[original_idx] = sorted_embds[sorted_pos]

        with self.vram_lock:
            self.currently_embedding -= 1

        return ordered_embds

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

        if settings.keep_models_in_memory:
            self.model = AutoModel.from_pretrained(model_id).to(self.device).eval()
            self.on_vram = (self.device == "cuda")
        else:
            self.model = AutoModel.from_pretrained(model_id).to("cpu").eval()
            self.on_vram = False
            
        print(f"SigLip Model loaded on device: {'cuda' if self.on_vram else 'cpu'}")
        self.vram_lock = threading.Lock()
        self.currently_embedding = 0

        self.logit_scale = self.model.logit_scale.exp().item()
        self.logit_bias = self.model.logit_bias.item()

    def free_vram(self):
        if self.device != "cuda" or settings.keep_models_in_memory:
            return
        with self.vram_lock:
            if (not self.on_vram) or (self.currently_embedding > 0):
                return
            
            self.model = self.model.to("cpu")
            torch.cuda.empty_cache()
            self.on_vram = False
            print(f"SigLip Model loaded on device: cpu")
            
    def load_on_vram(self):
        if self.device != "cuda":
            return
        with self.vram_lock:
            if self.on_vram:
                return
            self.model = self.model.to("cuda")
            self.on_vram = True
            print(f"SigLip Model loaded on device: cuda")
    
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
    def embed(self, chunks: List[ChunkInput], notify_cb=None) -> List[List[float]]:
        file_name = os.path.basename(chunks[0].metadata.get("path", "unknown"))
        
        if notify_cb:
            notify_cb(f"Loading Embedding Model... : {file_name} : 25")
        
        with self.vram_lock:
            self.currently_embedding += 1
        self.load_on_vram()

        embeddings: List[List[float]] = []

        if notify_cb:
            notify_cb(f"Embedding image... : {file_name} : 35")
        
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

        with self.vram_lock:
            self.currently_embedding -= 1

        return embeddings

class CrossEncoderReranker:

    MAX_LENGTH = 1024
    
    def __init__(self):
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CrossEncoder("BAAI/bge-reranker-v2-m3", device=self._device)
    
    def rerank(self, query: str, candidates: List) -> list:
        if not candidates:
            return []
        
        features = self.model.tokenizer(
            [query] * len(candidates),
            candidates,
            padding=True,
            truncation=True,
            max_length=self.MAX_LENGTH,
            return_tensors="pt"
        ).to(self._device)
        with torch.no_grad():
            logits = self.model.model(**features).logits.squeeze(-1)
            
        return logits.tolist()   # raw logits, no sigmoid


reranker = CrossEncoderReranker()
