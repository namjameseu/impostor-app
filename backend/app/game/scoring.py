from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

IMPOSTOR_ESCAPED_POINTS = 2
IMPOSTOR_GUESSED_POINTS = 1
GROUP_WIN_POINTS = 1


class RoundOutcome(StrEnum):
    GROUP_WINS = "group_wins"
    IMPOSTOR_ESCAPED = "impostor_escaped"
    IMPOSTOR_GUESSED_WORD = "impostor_guessed_word"


def determine_outcome(impostor_caught: bool, final_guess_correct: bool | None) -> RoundOutcome:
    if not impostor_caught:
        return RoundOutcome.IMPOSTOR_ESCAPED
    if final_guess_correct is None:
        raise ValueError("A caught Impostor's final guess must be recorded first.")
    return RoundOutcome.IMPOSTOR_GUESSED_WORD if final_guess_correct else RoundOutcome.GROUP_WINS


def round_points(
    player_ids: Sequence[int], impostor_id: int, outcome: RoundOutcome
) -> dict[int, int]:
    """Points each player earns for a round (0 for players who earn nothing)."""
    points = dict.fromkeys(player_ids, 0)
    if outcome == RoundOutcome.GROUP_WINS:
        for pid in player_ids:
            if pid != impostor_id:
                points[pid] = GROUP_WIN_POINTS
    elif outcome == RoundOutcome.IMPOSTOR_ESCAPED:
        points[impostor_id] = IMPOSTOR_ESCAPED_POINTS
    else:
        points[impostor_id] = IMPOSTOR_GUESSED_POINTS
    return points


def explain_outcome(outcome: RoundOutcome, impostor_name: str) -> str:
    match outcome:
        case RoundOutcome.GROUP_WINS:
            return (
                f"The group caught {impostor_name} and they missed the word. "
                f"Everyone else gets +{GROUP_WIN_POINTS}."
            )
        case RoundOutcome.IMPOSTOR_ESCAPED:
            return (
                f"{impostor_name} escaped undetected! +{IMPOSTOR_ESCAPED_POINTS} for the Impostor."
            )
        case RoundOutcome.IMPOSTOR_GUESSED_WORD:
            return (
                f"{impostor_name} was caught but guessed the word! "
                f"+{IMPOSTOR_GUESSED_POINTS} for the Impostor."
            )


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
