import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.vector_db_controller import router as vector_db_router, clear_router
from app.api.v1.embedding_controller import router as embedding_router
from app.api.v1.ingest_controller import router as ingest_router
from app.api.v1.files_controller import router as files_router
from app.api.v1 import config_controller, query_controller

def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.API_VERSION,
        description="AI-Powered File Management System"
    )

    # Middleware
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    application.include_router(ingest_router)
    application.include_router(files_router)
    application.include_router(vector_db_router)
    application.include_router(clear_router)
    application.include_router(embedding_router)
    application.include_router(config_controller.router, prefix="/api/v1")
    application.include_router(query_controller.router, prefix="/api/v1")

    @application.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "project": settings.PROJECT_NAME,
            "version": settings.API_VERSION
        }

    return application

app = create_app()

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)