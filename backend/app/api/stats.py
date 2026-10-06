from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.stats import StatsRead
from app.services import stats_service

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsRead)
def player_stats(
    db: Annotated[Session, Depends(get_db)],
    game_ids: Annotated[list[int], Query(max_length=stats_service.MAX_GAMES)] = [],  # noqa: B006
):
    """Stats for the given games (the frontend sends the games played on that device)."""
    return stats_service.player_stats(db, game_ids)
