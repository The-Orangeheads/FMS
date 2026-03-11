"""
Loads settings from .env file and validates them
"""

import os
from pydantic_settings import BaseSettings
from typing import Set

class Settings(BaseSettings):
    
    # === PROJECT INFO ===
    PROJECT_NAME: str = "Orangeheads - FMS"
    API_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # === PATHS ===
    MODELS_DIR: str = os.path.join(os.getcwd(), "models")
    DATA_DIR: str = os.path.join(os.getcwd(), "data")
    
    # === EMBEDDING MODELS ===
    TEXT_EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    IMAGE_EMBEDDING_MODEL: str = "openai/clip-vit-base-patch32"
    EMBEDDING_DIM: int = 384
    BATCH_SIZE: int = 32
    
    # === VECTOR DATABASE ===
    VECTOR_DB_PATH: str = os.path.join(os.getcwd(), "data", "vector_db.lancedb")
    
    # === FILE UPLOAD ===
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: str = "pdf docx txt jpg jpeg png"
    UPLOADS_IMAGES_DIR: str = os.path.join(os.getcwd(), "data", "uploads", "images")
    
    # === DUPLICATE DETECTION ===
    SIMILARITY_THRESHOLD: float = 0.95
    DBSCAN_EPS: float = 0.1
    DBSCAN_MIN_SAMPLES: int = 2
    
    # === LOGGING ===
    LOG_LEVEL: str = "INFO"
    
    class Config:
        """Pydantic config."""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

# global settings instance
settings = Settings()

# create the required directories
os.makedirs(settings.MODELS_DIR, exist_ok=True)
os.makedirs(settings.DATA_DIR, exist_ok=True)
os.makedirs(settings.UPLOADS_IMAGES_DIR, exist_ok=True)

print(f"Configuration loaded: {settings.PROJECT_NAME}")
print(f"Models directory: {settings.MODELS_DIR}")
print(f"Data directory: {settings.DATA_DIR}")
