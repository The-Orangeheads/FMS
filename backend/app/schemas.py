from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union

# --- INPUTS (From File Processing Team) ---

class ChunkInput(BaseModel):
    """
    Represents a single piece of data to be embedded.
    """
    text: Optional[str] = None
    image_base64: Optional[str] = None  # Images sent as base64 strings
    metadata: Dict[str, Any] = Field(
        default_factory=dict, 
        description="Arbitrary metadata (page_num, filename, etc.) to pass through."
    )

"""
The ... syntax means that the sender must include the model_name field, if not then return an error
The Field() function is just to add description/documentation to a variable
"""

class EmbeddingRequest(BaseModel):
    """
    The main payload sent to the Controller.
    """
    model_name: str = Field(..., description="The key of the model to use (e.g., 'siglip2')")
    chunks: List[ChunkInput]

# --- OUTPUTS (To Vector DB Team) ---

class EmbeddingOutput(BaseModel):
    """
    The result for a single chunk.
    """
    vector: List[float]
    metadata: Dict[str, Any]  # The same metadata passed back

class EmbeddingResponse(BaseModel):
    """
    The response sent back to the core logic or Vector DB controller.
    """
    model_used: str
    results: List[EmbeddingOutput]
    processing_time_ms: float

class VectorInsertRequest(BaseModel):
    embedding: List[float]
    file_path: str
    metadata: Optional[Dict[str, Any]] = None  # may be empty

class VectorQueryRequest(BaseModel):
    embedding: List[float]
    k: int = 5
class VectorQueryResponse(BaseModel):
    matches: List[Dict[str, Any]]