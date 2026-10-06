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
    max_impostors,
    transition,
    validate_impostor_count,
    validate_player_names,
)
from app.game.round_manager import build_role_view, choose_impostors, choose_starting_player
from app.game.scoring import (
    ImpostorResult,
    RoundOutcome,
    explain_round,
    impostor_result,
    rank_players,
    round_outcome,
    round_points,
)
from app.game.word_selector import WordCandidate, select_word

PLAYERS = [10, 11, 12, 13, 14]


# --- Impostor selection -------------------------------------------------------


def test_impostor_is_one_of_the_players():
    rng = random.Random(1)
    for _ in range(200):
        assert choose_impostors(PLAYERS, 1, (), rng)[0] in PLAYERS


def test_impostor_never_repeats_consecutively():
    rng = random.Random(2)
    previous: list[int] = []
    for _ in range(500):
        impostors = choose_impostors(PLAYERS, 1, previous, rng)
        assert impostors != previous
        previous = impostors


def test_impostor_selection_reaches_every_other_player():
    rng = random.Random(3)
    picks = {choose_impostors(PLAYERS, 1, [10], rng)[0] for _ in range(500)}
    assert picks == {11, 12, 13, 14}


def test_multiple_impostors_are_distinct_and_avoid_last_round():
    rng = random.Random(4)
    for _ in range(300):
        picks = choose_impostors(PLAYERS, 2, [10, 11], rng)
        assert len(set(picks)) == 2
        assert not set(picks) & {10, 11}


def test_impostors_repeat_only_when_not_enough_fresh_players():
    # 5 players, 3 Impostors, 3 were Impostors last round: only 2 fresh players exist.
    picks = choose_impostors(PLAYERS, 3, [10, 11, 12], random.Random(5))
    assert {13, 14} <= set(picks) and len(set(picks)) == 3


@pytest.mark.parametrize("count", [0, 5])
def test_impostor_count_must_leave_a_non_impostor(count):
    with pytest.raises(ValueError):
        choose_impostors(PLAYERS, count)


@pytest.mark.parametrize(("players", "limit"), [(3, 1), (4, 1), (5, 2), (6, 2), (7, 3), (20, 9)])
def test_impostors_are_always_outnumbered(players, limit):
    assert max_impostors(players) == limit
    validate_impostor_count(limit, players)
    with pytest.raises(GameValidationError):
        validate_impostor_count(limit + 1, players)


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

ESCAPED, GUESSED, MISSED = (
    ImpostorResult.ESCAPED,
    ImpostorResult.CAUGHT_GUESSED,
    ImpostorResult.CAUGHT_MISSED,
)


def test_impostor_result():
    assert impostor_result(False, None) == ESCAPED
    assert impostor_result(True, False) == MISSED
    assert impostor_result(True, True) == GUESSED
    with pytest.raises(ValueError):
        impostor_result(True, None)


def test_group_win_gives_every_non_impostor_one_point():
    points = round_points(PLAYERS, {12: MISSED})
    assert points == {10: 1, 11: 1, 12: 0, 13: 1, 14: 1}
    assert round_outcome({12: MISSED}) == RoundOutcome.GROUP_WINS


def test_escaped_impostor_gets_two_points():
    assert round_points(PLAYERS, {12: ESCAPED}) == {10: 0, 11: 0, 12: 2, 13: 0, 14: 0}
    assert round_outcome({12: ESCAPED}) == RoundOutcome.IMPOSTORS_WIN


def test_caught_impostor_guessing_word_gets_one_point():
    assert round_points(PLAYERS, {12: GUESSED}) == {10: 0, 11: 0, 12: 1, 13: 0, 14: 0}
    assert round_outcome({12: GUESSED}) == RoundOutcome.IMPOSTORS_WIN


def test_points_add_up_per_impostor():
    # Two Impostors caught and missing: every non-Impostor gets +1 per Impostor.
    assert round_points(PLAYERS, {12: MISSED, 13: MISSED}) == {10: 2, 11: 2, 12: 0, 13: 0, 14: 2}
    # Mixed: one escaped (+2), one caught-and-missed (crew +1).
    assert round_points(PLAYERS, {12: ESCAPED, 13: MISSED}) == {10: 1, 11: 1, 12: 2, 13: 0, 14: 1}
    assert round_outcome({12: ESCAPED, 13: MISSED}) == RoundOutcome.SPLIT


def test_explanations_name_each_impostor():
    names = {12: "Sarah", 13: "Mark", 14: "Anna"}
    text = explain_round({12: ESCAPED, 13: MISSED, 14: MISSED}, names)
    assert "Sarah escaped" in text
    assert "Mark and Anna" in text and "+2" in text


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


def test_fellow_impostors_only_given_to_impostors():
    crew = build_role_view(
        is_impostor=False,
        secret_word="Penguin",
        category="Animals",
        impostor_hint="category",
        fellow_impostors=["Mark"],
    )
    assert "fellow_impostors" not in crew.as_dict()
    impostor = build_role_view(
        is_impostor=True,
        secret_word="Penguin",
        category="Animals",
        impostor_hint="none",
        fellow_impostors=["Mark"],
    )
    assert impostor.as_dict() == {"role": "impostor", "fellow_impostors": ["Mark"]}
