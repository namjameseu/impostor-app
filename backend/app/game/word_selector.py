import random
from collections import defaultdict
from collections.abc import Collection, Sequence
from dataclasses import dataclass

from app.game.errors import GameValidationError
from app.game.round_manager import system_rng


@dataclass(frozen=True)
class WordCandidate:
    id: int
    word: str
    category_id: int
    category_name: str
    similar_word: str | None = None


def select_word(
    candidates: Sequence[WordCandidate],
    used_word_ids: Collection[int],
    rng: random.Random = system_rng,
) -> WordCandidate:
    """Pick a category uniformly, then a word in it, preferring words not yet used this game.

    Callers restrict `candidates` to a single category for specific-category games.
    Once every candidate has been used, words may repeat.
    """
    if not candidates:
        raise GameValidationError("No enabled words are available for this game's category.")

    fresh = [c for c in candidates if c.id not in used_word_ids] or list(candidates)
    by_category: dict[int, list[WordCandidate]] = defaultdict(list)
    for candidate in fresh:
        by_category[candidate.category_id].append(candidate)

    category_id = rng.choice(sorted(by_category))
    return rng.choice(by_category[category_id])


def choose_impostor_word(
    secret: WordCandidate,
    candidates: Sequence[WordCandidate],
    rng: random.Random = system_rng,
) -> str:
    """The related word Impostors get in Similar Word mode.

    Uses the word's curated similar word; otherwise another word from the same category
    (so it fits the category everyone is told), and as a last resort any other word.
    """
    curated = (secret.similar_word or "").strip()
    if curated and curated.casefold() != secret.word.casefold():
        return curated
    others = [c for c in candidates if c.word.casefold() != secret.word.casefold()]
    same_category = [c for c in others if c.category_id == secret.category_id]
    pool = same_category or others
    if not pool:
        raise GameValidationError("Similar Word mode needs at least two different words.")
    return rng.choice(pool).word
