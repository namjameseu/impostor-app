import re

from app.db.seed_data import SEED_DATA
from app.db.seed_hints import WORD_HINTS
from app.db.seed_similar import SIMILAR_WORDS
from app.models.word import DIFFICULTIES


def test_seed_data_is_valid():
    assert len({name.lower() for name in SEED_DATA}) == len(SEED_DATA)
    for name, (description, words_by_difficulty) in SEED_DATA.items():
        assert 1 <= len(name) <= 50 and len(description) <= 255
        assert set(words_by_difficulty) <= set(DIFFICULTIES)
        words = [w for ws in words_by_difficulty.values() for w in ws]
        lowered = [w.lower() for w in words]
        duplicates = {w for w in lowered if lowered.count(w) > 1}
        assert not duplicates, f"{name} has duplicate words: {duplicates}"
        assert all(w == w.strip() and 1 <= len(w) <= 80 for w in words)
        # Enough words for a full game without repeats.
        assert len(words) >= 20, f"{name} only has {len(words)} words"


def test_every_seed_word_has_a_similar_word():
    for name, (_, words_by_difficulty) in SEED_DATA.items():
        words = {w for ws in words_by_difficulty.values() for w in ws}
        similar = SIMILAR_WORDS.get(name, {})
        assert set(similar) == words, (
            f"{name}: missing {words - set(similar)}, extra {set(similar) - words}"
        )
        for word, related in similar.items():
            assert related.strip() and related.casefold() != word.casefold(), f"{name}: {word}"
            assert len(related) <= 80


def test_every_seed_word_has_a_hint():
    for name, (_, words_by_difficulty) in SEED_DATA.items():
        words = {w for ws in words_by_difficulty.values() for w in ws}
        hints = WORD_HINTS.get(name, {})
        assert set(hints) == words, (
            f"{name}: missing {words - set(hints)}, extra {set(hints) - words}"
        )
        for word, hint in hints.items():
            assert hint.strip() and len(hint) <= 40, f"{name}: {word}"
            assert " " not in hint, f"{name}: {word} hint {hint!r} is not a single word"
            # The hint must not give away the word itself (as a whole word, e.g. not
            # flagging "ear" for appearing inside "hear").
            assert not re.search(rf"\b{re.escape(word)}\b", hint, re.IGNORECASE), f"{name}: {word}"
