from fastapi import FastAPI
from app.core.config import settings

from app.api.v1.vector_db_controller import router as vector_db_router
from app.api.v1.embedding_controller import router as embedding_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.API_VERSION,
    description="AI-Powered File Management System"
)

app.include_router(vector_db_router)
app.include_router(embedding_router)

@app.get("/")
async def root():
    return {
        "status": "running",
        "project": settings.PROJECT_NAME,
        "version": settings.API_VERSION
    }

# @app.get("/health")
# async def health_check():
#     """Health check endpoint."""
#     return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
