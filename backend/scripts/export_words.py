"""Export the enabled word library to the frontend's offline word bundle.

The local (offline) game engine needs the full word pool on the client, so unlike the
admin-gated `/api/words`, this reads straight from the DB via the existing library
service and writes a plain JSON file the frontend precaches as a static asset.

Run after editing the library (via /library) and before redeploying the frontend:
    python -m scripts.export_words
"""

import json
from pathlib import Path

from app.db.session import SessionLocal
from app.services import library_service

OUTPUT = Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "words.json"


def build_bundle(db) -> list[dict]:
    categories = library_service.list_categories(db, include_disabled=False)
    words = library_service.list_words(db, include_disabled=False)
    words_by_category: dict[int, list[dict]] = {}
    for word in words:
        words_by_category.setdefault(word.category_id, []).append(
            {"id": word.id, "word": word.word, "similar_word": word.similar_word}
        )
    return [
        {"id": c.id, "name": c.name, "words": words_by_category.get(c.id, [])}
        for c in categories
        if words_by_category.get(c.id)
    ]


if __name__ == "__main__":
    with SessionLocal() as session:
        bundle = build_bundle(session)
    OUTPUT.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    total_words = sum(len(c["words"]) for c in bundle)
    print(f"Wrote {len(bundle)} categories and {total_words} words to {OUTPUT}")
