"""Idempotent seed: adds any missing seed categories/words, never overwrites edits.

Related words (Similar Word mode) are only filled in where a word has none yet.

Run with: python -m app.db.seed
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.seed_data import SEED_DATA
from app.db.seed_hints import WORD_HINTS
from app.db.seed_similar import SIMILAR_WORDS
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

        similar = {w.lower(): s for w, s in SIMILAR_WORDS.get(name, {}).items()}
        hints = {w.lower(): h for w, h in WORD_HINTS.get(name, {}).items()}
        existing = {
            w.word.lower(): w
            for w in db.scalars(select(Word).where(Word.category_id == category.id))
        }
        for difficulty, words in words_by_difficulty.items():
            for word in words:
                row = existing.get(word.lower())
                if row is None:
                    row = Word(category_id=category.id, word=word, difficulty=difficulty)
                    db.add(row)
                    existing[word.lower()] = row
                    added_words += 1
                if row.similar_word is None and word.lower() in similar:
                    row.similar_word = similar[word.lower()]
                if row.hint is None and word.lower() in hints:
                    row.hint = hints[word.lower()]
    db.commit()
    return added_categories, added_words


if __name__ == "__main__":
    with SessionLocal() as session:
        categories, words = seed(session)
    print(f"Seed complete: {categories} categories and {words} words added.")
