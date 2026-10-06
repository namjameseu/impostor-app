"""Impostor/starting-player selection and private role visibility for a round."""

import random
import secrets
from collections.abc import Sequence
from dataclasses import dataclass

from app.game.settings import ImpostorHint

system_rng: random.Random = secrets.SystemRandom()


def choose_impostor(
    player_ids: Sequence[int], previous_impostor_id: int | None, rng: random.Random = system_rng
) -> int:
    """Pick the Impostor, avoiding last round's Impostor whenever another player exists."""
    candidates = [pid for pid in player_ids if pid != previous_impostor_id]
    return rng.choice(candidates or list(player_ids))


def choose_starting_player(player_ids: Sequence[int], rng: random.Random = system_rng) -> int:
    """Pick who gives the first clue. Always random, so it reveals nothing about the Impostor."""
    return rng.choice(list(player_ids))


@dataclass(frozen=True)
class RoleView:
    role: str
    category: str | None = None
    word: str | None = None

    def as_dict(self) -> dict[str, str]:
        data = {"role": self.role}
        if self.category is not None:
            data["category"] = self.category
        if self.word is not None:
            data["word"] = self.word
        return data


def build_role_view(
    *, is_impostor: bool, secret_word: str, category: str, impostor_hint: str
) -> RoleView:
    """The only place a player's private role is assembled. The Impostor never gets the word."""
    if is_impostor:
        hint = category if impostor_hint == ImpostorHint.CATEGORY else None
        return RoleView(role="impostor", category=hint)
    return RoleView(role="player", category=category, word=secret_word)
