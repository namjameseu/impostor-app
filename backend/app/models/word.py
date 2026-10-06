from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.category import Category

DIFFICULTIES = ("easy", "medium", "hard")


class Word(TimestampMixin, Base):
    __tablename__ = "words"
    __table_args__ = (CheckConstraint(f"difficulty IN {DIFFICULTIES}", name="difficulty_valid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), index=True
    )
    word: Mapped[str] = mapped_column(String(80))
    difficulty: Mapped[str] = mapped_column(String(10), default="medium", index=True)
    enabled: Mapped[bool] = mapped_column(default=True, server_default=true())
    # Related word given to Impostors in Similar Word mode (e.g. Penguin -> Puffin).
    similar_word: Mapped[str | None] = mapped_column(String(80))

    category: Mapped["Category"] = relationship(back_populates="words")


Index("uq_words_category_word_lower", Word.category_id, func.lower(Word.word), unique=True)
