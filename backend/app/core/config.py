import os

from dotenv import load_dotenv

load_dotenv()


def _sqlalchemy_url(url: str) -> str:
    """Accept URLs as hosts give them (postgres://, postgresql://) and use the psycopg driver."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


DATABASE_URL = _sqlalchemy_url(
    os.getenv("DATABASE_URL", "postgresql+psycopg://impostor:impostor@localhost:5440/impostor")
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
# When set, changing the word library requires this passcode. Unset = open (local dev).
ADMIN_PASSCODE = os.getenv("ADMIN_PASSCODE") or None
# Built frontend to serve from the API (production image). Unset in development.
STATIC_DIR = os.getenv("STATIC_DIR") or None
