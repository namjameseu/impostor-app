"""Scoring, worked out per Impostor so it generalises to any number of them."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

IMPOSTOR_ESCAPED_POINTS = 2
IMPOSTOR_GUESSED_POINTS = 1
CREW_POINTS_PER_CATCH = 1


class ImpostorResult(StrEnum):
    ESCAPED = "escaped"
    CAUGHT_GUESSED = "caught_guessed"
    CAUGHT_MISSED = "caught_missed"


class RoundOutcome(StrEnum):
    """Round summary: did the group or the Impostors come out ahead?"""

    GROUP_WINS = "group_wins"  # every Impostor caught and missed the word
    IMPOSTORS_WIN = "impostors_win"  # no Impostor was caught-and-missed
    SPLIT = "split"  # some of each (only possible with several Impostors)


def impostor_result(caught: bool, guessed_word: bool | None) -> ImpostorResult:
    if not caught:
        return ImpostorResult.ESCAPED
    if guessed_word is None:
        raise ValueError("A caught Impostor's final guess must be recorded first.")
    return ImpostorResult.CAUGHT_GUESSED if guessed_word else ImpostorResult.CAUGHT_MISSED


def round_points(
    player_ids: Sequence[int], results: Mapping[int, ImpostorResult]
) -> dict[int, int]:
    """Points each player earns for a round, given each Impostor's result.

    - Escaped Impostor: +2 to that Impostor.
    - Caught Impostor who guessed the word: +1 to that Impostor.
    - Caught Impostor who missed: +1 to every non-Impostor.
    """
    points = dict.fromkeys(player_ids, 0)
    crew = [pid for pid in player_ids if pid not in results]
    for impostor_id, result in results.items():
        if result == ImpostorResult.ESCAPED:
            points[impostor_id] += IMPOSTOR_ESCAPED_POINTS
        elif result == ImpostorResult.CAUGHT_GUESSED:
            points[impostor_id] += IMPOSTOR_GUESSED_POINTS
        else:
            for pid in crew:
                points[pid] += CREW_POINTS_PER_CATCH
    return points


def round_outcome(results: Mapping[int, ImpostorResult]) -> RoundOutcome:
    missed = sum(r == ImpostorResult.CAUGHT_MISSED for r in results.values())
    if missed == len(results):
        return RoundOutcome.GROUP_WINS
    if missed == 0:
        return RoundOutcome.IMPOSTORS_WIN
    return RoundOutcome.SPLIT


def _join(names: Sequence[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def explain_round(results: Mapping[int, ImpostorResult], names: Mapping[int, str]) -> str:
    """One short sentence per kind of result, e.g. for the round-results screen."""
    by_result = {
        kind: [names[pid] for pid, r in results.items() if r == kind] for kind in ImpostorResult
    }
    sentences = []
    for name in by_result[ImpostorResult.ESCAPED]:
        sentences.append(f"{name} escaped undetected! +{IMPOSTOR_ESCAPED_POINTS} for {name}.")
    for name in by_result[ImpostorResult.CAUGHT_GUESSED]:
        sentences.append(
            f"{name} was caught but guessed the word! +{IMPOSTOR_GUESSED_POINTS} for {name}."
        )
    missed = by_result[ImpostorResult.CAUGHT_MISSED]
    if missed:
        crew_points = CREW_POINTS_PER_CATCH * len(missed)
        caught = (
            f"The group caught {missed[0]} and they missed the word."
            if len(missed) == 1
            else f"The group caught {_join(missed)} and none of them guessed the word."
        )
        sentences.append(f"{caught} Everyone else gets +{crew_points}.")
    return " ".join(sentences)


@dataclass(frozen=True)
class Standing:
    rank: int
    player_id: int
    name: str
    score: int


def rank_players(players: Sequence[tuple[int, str, int, int]]) -> list[Standing]:
    """Rank (id, name, score, order_index) tuples by score; ties share a rank (1, 1, 3...)."""
    ordered = sorted(players, key=lambda p: (-p[2], p[3]))
    standings: list[Standing] = []
    for position, (pid, name, score, _) in enumerate(ordered, start=1):
        rank = standings[-1].rank if standings and standings[-1].score == score else position
        standings.append(Standing(rank=rank, player_id=pid, name=name, score=score))
    return standings
