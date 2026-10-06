from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import CORS_ORIGINS
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
