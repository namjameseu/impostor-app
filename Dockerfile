# Production image: one container serving the API and the built React app.
# (docker-compose.yml is the separate development setup.)

# --- 1. Build the frontend -----------------------------------------------------
FROM node:24-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2. API + static files -------------------------------------------------------
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    STATIC_DIR=/app/static

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY --from=frontend /frontend/dist ./static

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
# Hosts like Render provide $PORT. Migrations and the (idempotent) seed run on every start.
# Gameplay is local-only now (frontend/src/game/), so there are no more server-side games to
# clean up (the old `python -m app.db.cleanup` step is gone along with that engine).
CMD ["sh", "-c", "alembic upgrade head && python -m app.db.seed && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
