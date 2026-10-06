from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Table,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.game.game_engine import GameState
from app.game.settings import CategoryMode, ImpostorHint

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.round import Round


def _in(values: type) -> str:
    return "(" + ", ".join(f"'{v.value}'" for v in values) + ")"


# Categories a game draws words from when category_mode is 'specific'.
game_categories = Table(
    "game_categories",
    Base.metadata,
    Column("game_id", ForeignKey("games.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True, index=True
    ),
)


class Game(TimestampMixin, Base):
    __tablename__ = "games"
    __table_args__ = (
        CheckConstraint(f"state IN {_in(GameState)}", name="state_valid"),
        CheckConstraint(f"category_mode IN {_in(CategoryMode)}", name="category_mode_valid"),
        CheckConstraint(f"impostor_hint IN {_in(ImpostorHint)}", name="impostor_hint_valid"),
        CheckConstraint("total_rounds > 0", name="total_rounds_positive"),
        CheckConstraint("impostor_count > 0", name="impostor_count_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    state: Mapped[str] = mapped_column(String(20), default=GameState.SETUP, index=True)
    total_rounds: Mapped[int]
    category_mode: Mapped[str] = mapped_column(String(20))
    impostor_hint: Mapped[str] = mapped_column(String(20))
    impostor_count: Mapped[int] = mapped_column(default=1, server_default="1")
    # When true, each Impostor's private role lists the other Impostors.
    impostors_know_each_other: Mapped[bool] = mapped_column(default=False, server_default=false())
    current_round_number: Mapped[int] = mapped_column(default=0)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    categories: Mapped[list["Category"]] = relationship(
        secondary=game_categories, order_by="Category.name"
    )
    players: Mapped[list["GamePlayer"]] = relationship(
        back_populates="game",
        order_by="GamePlayer.order_index",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    rounds: Mapped[list["Round"]] = relationship(
        back_populates="game",
        order_by="Round.round_number",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class GamePlayer(TimestampMixin, Base):
    __tablename__ = "game_players"
    __table_args__ = (UniqueConstraint("game_id", "order_index"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(30))
    score: Mapped[int] = mapped_column(default=0)
    order_index: Mapped[int]

    game: Mapped[Game] = relationship(back_populates="players")


Index(
    "uq_game_players_game_name_lower", GamePlayer.game_id, func.lower(GamePlayer.name), unique=True
)
