"""Unit tests for the pure game engine (no database)."""

import random
from itertools import product

import pytest

from app.game.errors import GameValidationError, InvalidStateError
from app.game.game_engine import (
    TRANSITIONS,
    GameState,
    is_impostor_visible,
    is_word_visible,
    transition,
    validate_player_names,
)
from app.game.round_manager import build_role_view, choose_impostor, choose_starting_player
from app.game.scoring import RoundOutcome, determine_outcome, rank_players, round_points
from app.game.word_selector import WordCandidate, select_word

PLAYERS = [10, 11, 12, 13, 14]


# --- Impostor selection -------------------------------------------------------


def test_impostor_is_one_of_the_players():
    rng = random.Random(1)
    for _ in range(200):
        assert choose_impostor(PLAYERS, None, rng) in PLAYERS


def test_impostor_never_repeats_consecutively():
    rng = random.Random(2)
    previous = None
    for _ in range(500):
        impostor = choose_impostor(PLAYERS, previous, rng)
        assert impostor != previous
        previous = impostor


def test_impostor_selection_reaches_every_other_player():
    rng = random.Random(3)
    picks = {choose_impostor(PLAYERS, 10, rng) for _ in range(500)}
    assert picks == {11, 12, 13, 14}


def test_impostor_repeat_allowed_when_no_alternative():
    assert choose_impostor([7], 7, random.Random(0)) == 7


# --- Starting player ----------------------------------------------------------


def test_random_starting_player_covers_all_players():
    rng = random.Random(4)
    picks = {choose_starting_player(PLAYERS, rng) for _ in range(500)}
    assert picks == set(PLAYERS)


# --- Word selection -----------------------------------------------------------


def _candidates() -> list[WordCandidate]:
    return [
        WordCandidate(1, "Penguin", 1, "Animals"),
        WordCandidate(2, "Dolphin", 1, "Animals"),
        WordCandidate(3, "Pizza", 2, "Food"),
    ]


def test_word_selection_skips_used_words():
    rng = random.Random(5)
    for _ in range(100):
        assert select_word(_candidates(), {1, 3}, rng).id == 2


def test_word_selection_falls_back_when_everything_used():
    assert select_word(_candidates(), {1, 2, 3}, random.Random(6)).id in {1, 2, 3}


def test_word_selection_without_repeats_until_exhausted():
    rng = random.Random(7)
    used: set[int] = set()
    for _ in range(3):
        used.add(select_word(_candidates(), used, rng).id)
    assert used == {1, 2, 3}


def test_random_category_is_chosen_before_word():
    # Food has one word vs two Animals words, but categories are equally likely.
    rng = random.Random(8)
    picks = [select_word(_candidates(), set(), rng).category_id for _ in range(2000)]
    assert 0.4 < picks.count(2) / len(picks) < 0.6


def test_word_selection_requires_candidates():
    with pytest.raises(GameValidationError):
        select_word([], set())


# --- Role visibility ----------------------------------------------------------


def test_normal_player_sees_word_and_category():
    view = build_role_view(
        is_impostor=False, secret_word="Penguin", category="Animals", impostor_hint="none"
    )
    assert view.as_dict() == {"role": "player", "category": "Animals", "word": "Penguin"}


@pytest.mark.parametrize("hint", ["none", "category"])
def test_impostor_never_receives_secret_word(hint):
    view = build_role_view(
        is_impostor=True, secret_word="Penguin", category="Animals", impostor_hint=hint
    )
    data = view.as_dict()
    assert "word" not in data
    assert "Penguin" not in str(data)


def test_impostor_hint_modes():
    with_hint = build_role_view(
        is_impostor=True, secret_word="Penguin", category="Animals", impostor_hint="category"
    )
    without = build_role_view(
        is_impostor=True, secret_word="Penguin", category="Animals", impostor_hint="none"
    )
    assert with_hint.as_dict() == {"role": "impostor", "category": "Animals"}
    assert without.as_dict() == {"role": "impostor"}


def test_secret_visibility_by_state():
    hidden = [
        GameState.SETUP,
        GameState.ROLE_REVEAL,
        GameState.READY,
        GameState.CLUE_ROUND,
        GameState.VOTING,
        GameState.IMPOSTOR_REVEAL,
    ]
    for state in hidden:
        assert not is_impostor_visible(state)
        assert not is_word_visible(state, word_revealed=True)
    assert is_impostor_visible(GameState.FINAL_GUESS)
    assert not is_word_visible(GameState.FINAL_GUESS, word_revealed=False)
    assert is_word_visible(GameState.FINAL_GUESS, word_revealed=True)
    assert is_word_visible(GameState.ROUND_RESULTS, word_revealed=False)


# --- Scoring ------------------------------------------------------------------


def test_outcome_determination():
    assert determine_outcome(False, None) == RoundOutcome.IMPOSTOR_ESCAPED
    assert determine_outcome(True, False) == RoundOutcome.GROUP_WINS
    assert determine_outcome(True, True) == RoundOutcome.IMPOSTOR_GUESSED_WORD
    with pytest.raises(ValueError):
        determine_outcome(True, None)


def test_group_win_gives_every_non_impostor_one_point():
    points = round_points(PLAYERS, 12, RoundOutcome.GROUP_WINS)
    assert points == {10: 1, 11: 1, 12: 0, 13: 1, 14: 1}


def test_escaped_impostor_gets_two_points():
    points = round_points(PLAYERS, 12, RoundOutcome.IMPOSTOR_ESCAPED)
    assert points == {10: 0, 11: 0, 12: 2, 13: 0, 14: 0}


def test_caught_impostor_guessing_word_gets_one_point():
    points = round_points(PLAYERS, 12, RoundOutcome.IMPOSTOR_GUESSED_WORD)
    assert points == {10: 0, 11: 0, 12: 1, 13: 0, 14: 0}


def test_rankings_sort_by_score_and_share_ties():
    standings = rank_players([(1, "A", 3, 0), (2, "B", 7, 1), (3, "C", 3, 2), (4, "D", 1, 3)])
    assert [(s.name, s.rank) for s in standings] == [("B", 1), ("A", 2), ("C", 2), ("D", 4)]


# --- State machine & setup validation -----------------------------------------


def test_only_declared_transitions_are_allowed():
    for current, target in product(GameState, GameState):
        if target in TRANSITIONS[current]:
            assert transition(current, target) == target
        else:
            with pytest.raises(InvalidStateError):
                transition(current, target)


def test_game_results_is_terminal():
    assert TRANSITIONS[GameState.GAME_RESULTS] == frozenset()


@pytest.mark.parametrize(
    "names",
    [
        ["Ann", "Bob"],  # too few
        ["Ann", "Bob", " "],  # empty
        ["Ann", "Bob", "ann"],  # case-insensitive duplicate
        ["Ann", "Bob", "x" * 31],  # too long
    ],
)
def test_invalid_player_lists_are_rejected(names):
    with pytest.raises(GameValidationError):
        validate_player_names(names)


def test_player_names_are_trimmed():
    assert validate_player_names(["  Ann ", "Bob", "Cy  Lee"]) == ["Ann", "Bob", "Cy Lee"]
