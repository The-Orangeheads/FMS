"""
Loads settings from .env file and validates them
"""

import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    
    # =========================== CONSTANTS (.env) ===========================

    # === PROJECT INFO ===
    PROJECT_NAME: str = "Orangeheads - FMS"
    API_VERSION: str = "1.0.0"
    
    # === PATHS ===
    MODELS_DIR: str = os.path.join(os.getcwd(), "models")
    DATA_DIR: str = os.path.join(os.getcwd(), "data")
    
    # === EMBEDDING MODELS ===
    DEFAULT_TEXT_EMBEDDING_MODEL: str = "bge-m3"
    DEFAULT_IMAGE_EMBEDDING_MODEL: str = "siglip2"
    DEFAULT_BATCH_SIZE: int = 1
    
    # === FILE HANDLING ===
    MAX_FILE_SIZE_MB: int = 50
    
    # === DUPLICATE DETECTION ===
    SIMILARITY_THRESHOLD: float = 0.95
    DBSCAN_EPS: float = 0.1
    DBSCAN_MIN_SAMPLES: int = 2

    # === DUPLICATE DETECTION ===


    # =========================== SETTINGS ===========================

    cur_text_embedding_model: str = "auto"
    cur_image_embedding_model: str = "auto"
    chunk_strategy: str = "recursive"
    batch_size: int = 1
    top_k: int = 5
    chunk_size: int = 500
    chunk_overlap: int = 50
    include_metadata: bool = True
    pdf_complexity_threshold: int = 15
    auto_sync_interval_seconds : float = 60

    class Config:
        """Pydantic config."""
        env_file = os.path.join(os.getcwd(), ".env")
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"

# global settings instance
settings = Settings()

# create the required directories
os.makedirs(settings.MODELS_DIR, exist_ok=True)
os.makedirs(settings.DATA_DIR, exist_ok=True)

print(f"Configuration loaded: {settings.PROJECT_NAME}")
print(f"Models directory: {settings.MODELS_DIR}")
print(f"Data directory: {settings.DATA_DIR}")
