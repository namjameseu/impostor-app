from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import CORS_ORIGINS, STATIC_DIR
from app.game.errors import (
    ConflictError,
    GameError,
    GameValidationError,
    InvalidStateError,
    NotFoundError,
    RoleAccessError,
)

app = FastAPI(title="Impostor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

ERROR_STATUS: dict[type[GameError], int] = {
    NotFoundError: 404,
    RoleAccessError: 403,
    InvalidStateError: 409,
    ConflictError: 409,
    GameValidationError: 400,
}


@app.exception_handler(GameError)
def handle_game_error(_: Request, exc: GameError) -> JSONResponse:
    status_code = next((code for cls, code in ERROR_STATUS.items() if isinstance(exc, cls)), 400)
    return JSONResponse(status_code=status_code, content={"detail": str(exc)})


app.include_router(api_router)


def mount_frontend(static_dir: Path) -> None:
    """Serve the built React app; unknown non-API paths get index.html (client-side routes)."""
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")
    root = static_dir.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        if path.startswith("api/") or path == "api":
            raise HTTPException(status_code=404)
        file = (root / path).resolve()
        if path and file.is_file() and root in file.parents:
            return FileResponse(file)
        return FileResponse(root / "index.html")


if STATIC_DIR and Path(STATIC_DIR, "index.html").is_file():
    mount_frontend(Path(STATIC_DIR))
