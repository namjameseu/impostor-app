from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.game.scoring import RoundOutcome

if TYPE_CHECKING:
    from app.models.game import Game


class Round(TimestampMixin, Base):
    __tablename__ = "rounds"
    __table_args__ = (
        UniqueConstraint("game_id", "round_number"),
        CheckConstraint(
            "outcome IS NULL OR outcome IN ("
            + ", ".join(f"'{o.value}'" for o in RoundOutcome)
            + ")",
            name="outcome_valid",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"))
    round_number: Mapped[int]

    # Category and word are snapshotted so library edits/deletes don't rewrite history.
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    category_name: Mapped[str] = mapped_column(String(50))
    word_id: Mapped[int | None] = mapped_column(
        ForeignKey("words.id", ondelete="SET NULL"), index=True
    )
    secret_word: Mapped[str] = mapped_column(String(80))

    impostor_id: Mapped[int] = mapped_column(ForeignKey("game_players.id"), index=True)
    starting_player_id: Mapped[int] = mapped_column(ForeignKey("game_players.id"))
    suspect_id: Mapped[int | None] = mapped_column(ForeignKey("game_players.id"))

    # Index (in player order) of the player whose turn it is to view their role.
    reveal_index: Mapped[int] = mapped_column(default=0)
    word_revealed: Mapped[bool] = mapped_column(default=False)
    impostor_caught: Mapped[bool | None]
    final_guess_correct: Mapped[bool | None]
    outcome: Mapped[str | None] = mapped_column(String(30))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    game: Mapped["Game"] = relationship(back_populates="rounds")
