from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.errors import ConflictError, NotFoundError
from app.models import Category, Word
from app.schemas.library import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    WordCreate,
    WordRead,
    WordUpdate,
)


def _category_read(category: Category, word_count: int) -> CategoryRead:
    return CategoryRead.model_validate(category).model_copy(update={"word_count": word_count})


def _word_read(word: Word) -> WordRead:
    return WordRead(
        id=word.id,
        category_id=word.category_id,
        category_name=word.category.name,
        word=word.word,
        difficulty=word.difficulty,
        enabled=word.enabled,
        similar_word=word.similar_word,
        hint=word.hint,
        created_at=word.created_at,
        updated_at=word.updated_at,
    )


def _commit(db: Session, conflict_message: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(conflict_message) from exc


def list_categories(db: Session, include_disabled: bool = True) -> list[CategoryRead]:
    word_counts = (
        select(Word.category_id, func.count(Word.id).label("n"))
        .where(Word.enabled)
        .group_by(Word.category_id)
        .subquery()
    )
    stmt = (
        select(Category, func.coalesce(word_counts.c.n, 0))
        .outerjoin(word_counts, word_counts.c.category_id == Category.id)
        .order_by(func.lower(Category.name))
    )
    if not include_disabled:
        stmt = stmt.where(Category.enabled)
    return [_category_read(c, n) for c, n in db.execute(stmt)]


def _get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category not found.")
    return category


def _enabled_word_count(db: Session, category_id: int) -> int:
    return db.scalar(
        select(func.count(Word.id)).where(Word.category_id == category_id, Word.enabled)
    )


def create_category(db: Session, data: CategoryCreate) -> CategoryRead:
    category = Category(**data.model_dump())
    db.add(category)
    _commit(db, f"A category named '{data.name}' already exists.")
    db.refresh(category)
    return _category_read(category, 0)


def update_category(db: Session, category_id: int, data: CategoryUpdate) -> CategoryRead:
    category = _get_category(db, category_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    _commit(db, "A category with that name already exists.")
    db.refresh(category)
    return _category_read(category, _enabled_word_count(db, category.id))


def list_words(
    db: Session,
    *,
    category_id: int | None = None,
    difficulty: str | None = None,
    search: str | None = None,
    include_disabled: bool = True,
) -> list[WordRead]:
    stmt = (
        select(Word)
        .options(joinedload(Word.category))
        .join(Word.category)
        .order_by(func.lower(Category.name), func.lower(Word.word))
    )
    if category_id is not None:
        stmt = stmt.where(Word.category_id == category_id)
    if difficulty:
        stmt = stmt.where(Word.difficulty == difficulty)
    if search:
        stmt = stmt.where(Word.word.ilike(f"%{search.strip()}%"))
    if not include_disabled:
        stmt = stmt.where(Word.enabled)
    return [_word_read(w) for w in db.scalars(stmt)]


def _get_word(db: Session, word_id: int) -> Word:
    word = db.get(Word, word_id, options=[joinedload(Word.category)])
    if word is None:
        raise NotFoundError("Word not found.")
    return word


def create_word(db: Session, data: WordCreate) -> WordRead:
    _get_category(db, data.category_id)
    word = Word(**data.model_dump())
    db.add(word)
    _commit(db, f"'{data.word}' already exists in that category.")
    return _word_read(_get_word(db, word.id))


def update_word(db: Session, word_id: int, data: WordUpdate) -> WordRead:
    word = _get_word(db, word_id)
    changes = data.model_dump(exclude_unset=True)
    if "category_id" in changes:
        _get_category(db, changes["category_id"])
    for field, value in changes.items():
        setattr(word, field, value)
    _commit(db, "That word already exists in the category.")
    db.expire(word)
    return _word_read(_get_word(db, word_id))


def delete_word(db: Session, word_id: int) -> None:
    db.delete(_get_word(db, word_id))
    db.commit()
