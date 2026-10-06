"""Idempotent seed: adds any missing seed categories/words, never overwrites edits.

Run with: python -m app.db.seed
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.seed_data import SEED_DATA
from app.db.session import SessionLocal
from app.models import Category, Word


def seed(db: Session) -> tuple[int, int]:
    added_categories = added_words = 0
    for name, (description, words_by_difficulty) in SEED_DATA.items():
        category = db.scalars(
            select(Category).where(func.lower(Category.name) == name.lower())
        ).one_or_none()
        if category is None:
            category = Category(name=name, description=description)
            db.add(category)
            db.flush()
            added_categories += 1

        existing = {
            w.lower() for w in db.scalars(select(Word.word).where(Word.category_id == category.id))
        }
        for difficulty, words in words_by_difficulty.items():
            for word in words:
                if word.lower() not in existing:
                    db.add(Word(category_id=category.id, word=word, difficulty=difficulty))
                    existing.add(word.lower())
                    added_words += 1
    db.commit()
    return added_categories, added_words


if __name__ == "__main__":
    with SessionLocal() as session:
        categories, words = seed(session)
    print(f"Seed complete: {categories} categories and {words} words added.")
