from fastapi import FastAPI
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.API_VERSION,
    description="AI-Powered File Management System"
)

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
