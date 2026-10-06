from typing import TYPE_CHECKING

from sqlalchemy import Index, String, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.word import Word


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(String(255))
    enabled: Mapped[bool] = mapped_column(default=True, server_default=true())

    words: Mapped[list["Word"]] = relationship(
        back_populates="category", cascade="all, delete-orphan", passive_deletes=True
    )


Index("uq_categories_name_lower", func.lower(Category.name), unique=True)
