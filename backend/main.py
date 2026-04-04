import uvicorn
from fastapi import FastAPI
from app.core.config import settings
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.vector_db_controller import router as vector_db_router, clear_router
from app.api.embedding_controller import router as embedding_router
from app.api.filesync_controller import router as filesync_controller
from app.api import config_controller

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
    application.include_router(filesync_controller)
    application.include_router(vector_db_router)
    application.include_router(clear_router)
    application.include_router(embedding_router)
    application.include_router(config_controller.router, prefix="/api")
    
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
    uvicorn.run("main:app", port=8000, log_level="info", reload=True)