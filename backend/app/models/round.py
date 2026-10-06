from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
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
    # Similar Word mode: the related word every Impostor gets this round.
    impostor_word: Mapped[str | None] = mapped_column(String(80))

    # Player rows are only deleted along with their game, so these links cascade with it.
    starting_player_id: Mapped[int] = mapped_column(
        ForeignKey("game_players.id", ondelete="CASCADE")
    )

    # Index (in player order) of the player whose turn it is to view their role.
    reveal_index: Mapped[int] = mapped_column(default=0)
    word_revealed: Mapped[bool] = mapped_column(default=False)
    outcome: Mapped[str | None] = mapped_column(String(30))
    # Points each player earned this round, {player_id: points}, saved when the round ends.
    # Its keys are also the round's participants (players can join or leave between rounds).
    points: Mapped[dict[str, int] | None] = mapped_column(JSONB)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    game: Mapped["Game"] = relationship(back_populates="rounds")
    impostors: Mapped[list["RoundImpostor"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
    suspects: Mapped[list["RoundSuspect"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def impostor_ids(self) -> list[int]:
        return [i.player_id for i in self.impostors]

    @property
    def suspect_ids(self) -> list[int]:
        return [s.player_id for s in self.suspects]

    @property
    def points_by_player(self) -> dict[int, int]:
        return {int(pid): pts for pid, pts in (self.points or {}).items()}

    def is_caught(self, impostor_id: int) -> bool:
        return impostor_id in self.suspect_ids


class RoundImpostor(Base):
    """A player who is an Impostor this round, and how their final guess went."""

    __tablename__ = "round_impostors"

    round_id: Mapped[int] = mapped_column(
        ForeignKey("rounds.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("game_players.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    # Null until a caught Impostor's final guess is recorded (stays null if they escaped).
    guessed_word: Mapped[bool | None]


class RoundSuspect(Base):
    """A player the group accused this round."""

    __tablename__ = "round_suspects"

    round_id: Mapped[int] = mapped_column(
        ForeignKey("rounds.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("game_players.id", ondelete="CASCADE"), primary_key=True
    )
