from fastapi import FastAPI
import uvicorn

from app.core.config import settings
from app.api.v1.vector_db_controller import router as vector_db_router
from app.api.v1.embedding_controller import router as embedding_router
from app.api.v1.file_processing_controller import router as file_processing_router 

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.API_VERSION,
    description="AI-Powered File Management System"
)

app.include_router(vector_db_router)
app.include_router(embedding_router)
app.include_router(file_processing_router)

# --- ENDPOINTS ---
@app.get("/")
async def root():
    return {
        "status": "running",
        "project": settings.PROJECT_NAME,
        "version": settings.API_VERSION
    }

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)