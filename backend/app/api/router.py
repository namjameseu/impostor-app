from fastapi import APIRouter

from app.api import admin, library

api_router = APIRouter(prefix="/api")
api_router.include_router(library.router)
api_router.include_router(admin.router)


@api_router.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
