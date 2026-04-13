import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import asyncio

from app.core.config import settings
from app.api.vector_db_controller import router as vector_db_router, clear_router
from app.api.filesync_controller import router as filesync_router
from app.api.duplicate_controller import router as duplicates_router
from app.api import config_controller
from app.core.websockets import ws_manager

from app.services.filesync_service import file_syncer

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # this secion runs on app startup
    auto_sync_task = asyncio.create_task(file_syncer.auto_sync())
    dd_auto_sync_task = asyncio.create_task(file_syncer.auto_sync_dd())
    yield
    # this secion runs on app shutdown
    auto_sync_task.cancel()
    dd_auto_sync_task.cancel()


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.API_VERSION,
        description="AI-Powered File Management System",
        lifespan = lifespan
    )

    # Middleware - allow all for development to stop 403s
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    application.include_router(filesync_router)
    application.include_router(vector_db_router)
    application.include_router(clear_router)
    application.include_router(duplicates_router)
    application.include_router(config_controller.router, prefix="/api")
    
    # WebSocket Route - Placing it here ensures it's at /ws
    @application.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await ws_manager.connect(websocket)
        try:
            while True:
                # Keep connection alive
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket)
        except Exception:
            ws_manager.disconnect(websocket)

    @application.get("/health")
    async def health_check():
        return {"status": "healthy"}
    
    return application

app = create_app()