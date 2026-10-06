"""Impostor/starting-player selection and private role visibility for a round."""

import random
import secrets
from collections.abc import Collection, Sequence
from dataclasses import dataclass

from app.game.settings import ImpostorHint

system_rng: random.Random = secrets.SystemRandom()


def choose_impostors(
    player_ids: Sequence[int],
    count: int,
    previous_impostor_ids: Collection[int] = (),
    rng: random.Random = system_rng,
) -> list[int]:
    """Pick `count` Impostors, avoiding last round's Impostors wherever possible."""
    if not 1 <= count < len(player_ids):
        raise ValueError("There must be at least one Impostor and at least one other player.")
    fresh = [pid for pid in player_ids if pid not in previous_impostor_ids]
    if len(fresh) >= count:
        return rng.sample(fresh, count)
    repeats = [pid for pid in player_ids if pid in previous_impostor_ids]
    return fresh + rng.sample(repeats, count - len(fresh))


def choose_starting_player(player_ids: Sequence[int], rng: random.Random = system_rng) -> int:
    """Pick who gives the first clue. Always random, so it reveals nothing about the Impostor."""
    return rng.choice(list(player_ids))


@dataclass(frozen=True)
class RoleView:
    role: str
    category: str | None = None
    word: str | None = None
    fellow_impostors: tuple[str, ...] | None = None

    def as_dict(self) -> dict[str, object]:
        data: dict[str, object] = {"role": self.role}
        if self.category is not None:
            data["category"] = self.category
        if self.word is not None:
            data["word"] = self.word
        if self.fellow_impostors is not None:
            data["fellow_impostors"] = list(self.fellow_impostors)
        return data


def build_role_view(
    *,
    is_impostor: bool,
    secret_word: str,
    category: str,
    impostor_hint: str,
    fellow_impostors: Sequence[str] | None = None,
) -> RoleView:
    """The only place a player's private role is assembled. The Impostor never gets the word.

    `fellow_impostors` (the other Impostors' names) is only ever given to an Impostor.
    """
    if is_impostor:
        hint = category if impostor_hint == ImpostorHint.CATEGORY else None
        fellows = tuple(fellow_impostors) if fellow_impostors is not None else None
        return RoleView(role="impostor", category=hint, fellow_impostors=fellows)
    return RoleView(role="player", category=category, word=secret_word)
