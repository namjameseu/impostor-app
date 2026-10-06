"""Delete old games so the database doesn't grow forever.

- Unfinished games untouched for ABANDONED_GAME_DAYS (default 7) are abandoned.
- Finished games older than FINISHED_GAME_DAYS (default 365) are removed (their stats go too).

Runs on every container start (see Dockerfile); on Render's free tier that's whenever the
app wakes up. Run manually with: python -m app.db.cleanup
"""

import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, or_
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.game.game_engine import GameState
from app.models import Game


def cleanup(db: Session, *, abandoned_days: int, finished_days: int, now: datetime) -> int:
    abandoned_before = now - timedelta(days=abandoned_days)
    finished_before = now - timedelta(days=finished_days)
    result = db.execute(
        delete(Game).where(
            or_(
                (Game.state != GameState.GAME_RESULTS) & (Game.updated_at < abandoned_before),
                (Game.state == GameState.GAME_RESULTS) & (Game.finished_at < finished_before),
            )
        )
    )
    db.commit()
    return result.rowcount


if __name__ == "__main__":
    with SessionLocal() as session:
        removed = cleanup(
            session,
            abandoned_days=int(os.getenv("ABANDONED_GAME_DAYS", "7")),
            finished_days=int(os.getenv("FINISHED_GAME_DAYS", "365")),
            now=datetime.now(UTC),
        )
    print(f"Cleanup complete: {removed} old games removed.")
