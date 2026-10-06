"""Game state machine and player-list rules. Pure logic, no database access."""

from collections.abc import Iterable
from enum import StrEnum

from app.game.errors import GameValidationError, InvalidStateError

MIN_PLAYERS = 3
MAX_PLAYERS = 20
MAX_NAME_LENGTH = 30


class GameState(StrEnum):
    SETUP = "SETUP"
    ROLE_REVEAL = "ROLE_REVEAL"
    READY = "READY"
    CLUE_ROUND = "CLUE_ROUND"
    VOTING = "VOTING"
    IMPOSTOR_REVEAL = "IMPOSTOR_REVEAL"
    FINAL_GUESS = "FINAL_GUESS"
    ROUND_RESULTS = "ROUND_RESULTS"
    GAME_RESULTS = "GAME_RESULTS"


TRANSITIONS: dict[GameState, frozenset[GameState]] = {
    GameState.SETUP: frozenset({GameState.ROLE_REVEAL}),
    GameState.ROLE_REVEAL: frozenset({GameState.READY}),
    GameState.READY: frozenset({GameState.CLUE_ROUND}),
    GameState.CLUE_ROUND: frozenset({GameState.VOTING}),
    GameState.VOTING: frozenset({GameState.IMPOSTOR_REVEAL}),
    GameState.IMPOSTOR_REVEAL: frozenset({GameState.FINAL_GUESS, GameState.ROUND_RESULTS}),
    GameState.FINAL_GUESS: frozenset({GameState.ROUND_RESULTS}),
    GameState.ROUND_RESULTS: frozenset({GameState.ROLE_REVEAL, GameState.GAME_RESULTS}),
    GameState.GAME_RESULTS: frozenset(),
}

# States in which the current round's Impostor identity may be shown.
IMPOSTOR_VISIBLE_STATES = frozenset(
    {GameState.FINAL_GUESS, GameState.ROUND_RESULTS, GameState.GAME_RESULTS}
)
# States in which the current round's secret word may always be shown
# (during FINAL_GUESS it is shown only after the explicit word reveal).
WORD_VISIBLE_STATES = frozenset({GameState.ROUND_RESULTS, GameState.GAME_RESULTS})


def require_state(current: str, *allowed: GameState, action: str) -> None:
    if GameState(current) not in allowed:
        raise InvalidStateError(f"Cannot {action} while the game is in {current}.")


def transition(current: str, target: GameState) -> GameState:
    state = GameState(current)
    if target not in TRANSITIONS[state]:
        raise InvalidStateError(f"Cannot move from {state} to {target}.")
    return target


def has_more_rounds(current_round_number: int, total_rounds: int) -> bool:
    return current_round_number < total_rounds


def is_word_visible(state: str, word_revealed: bool) -> bool:
    return GameState(state) in WORD_VISIBLE_STATES or (
        state == GameState.FINAL_GUESS and word_revealed
    )


def is_impostor_visible(state: str) -> bool:
    return GameState(state) in IMPOSTOR_VISIBLE_STATES


def max_impostors(player_count: int) -> int:
    """Impostors must always be outnumbered: 1 for 3-4 players, 2 for 5-6, 3 for 7-8..."""
    return max(1, (player_count - 1) // 2)


def validate_impostor_count(impostor_count: int, player_count: int) -> None:
    limit = max_impostors(player_count)
    if not 1 <= impostor_count <= limit:
        raise GameValidationError(
            f"{player_count} players can have 1 to {limit} Impostor{'s' if limit > 1 else ''}."
        )


def validate_player_names(names: Iterable[str]) -> list[str]:
    cleaned = [" ".join(name.split()) for name in names]
    if any(not name for name in cleaned):
        raise GameValidationError("Player names cannot be empty.")
    if any(len(name) > MAX_NAME_LENGTH for name in cleaned):
        raise GameValidationError(f"Player names must be at most {MAX_NAME_LENGTH} characters.")
    if len({name.casefold() for name in cleaned}) != len(cleaned):
        raise GameValidationError("Player names must be unique.")
    if not MIN_PLAYERS <= len(cleaned) <= MAX_PLAYERS:
        raise GameValidationError(f"A game needs {MIN_PLAYERS} to {MAX_PLAYERS} players.")
    return cleaned
