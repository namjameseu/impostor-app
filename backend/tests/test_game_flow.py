"""API-level tests for game progression, secrecy and state enforcement."""

import random

import pytest

from app.services import game_service
from tests.conftest import TEST_WORDS

ALL_TEST_WORDS = [w for words in TEST_WORDS.values() for w in words]
NAMES = ["James", "Lloyd", "Sarah", "Mark", "Anna"]


def create_game(client, players=NAMES, **settings):
    resp = client.post("/api/games", json={"players": players, "settings": settings})
    assert resp.status_code == 201, resp.text
    return resp.json()


def start(client, game_id):
    resp = client.post(f"/api/games/{game_id}/start")
    assert resp.status_code == 200, resp.text
    return resp.json()


def url(game, path):
    return f"/api/games/{game['id']}/rounds/current{path}"


def assert_no_secret_word(payload):
    text = str(payload)
    assert not any(word in text for word in ALL_TEST_WORDS), text


def reveal_all_roles(client, game):
    """Walk through role reveal. Returns (game, {player_id: role})."""
    roles = {}
    for player in game["players"]:
        assert game["round"]["revealer_id"] == player["id"]
        role = client.get(url(game, f"/players/{player['id']}/role"))
        assert role.status_code == 200, role.text
        roles[player["id"]] = role.json()
        game = client.post(url(game, f"/players/{player['id']}/reveal-complete")).json()
    return game, roles


def play_to_voting(client, game):
    game, roles = reveal_all_roles(client, game)
    assert game["state"] == "READY"
    game = client.post(url(game, "/start-clues")).json()
    assert game["state"] == "CLUE_ROUND"
    game = client.post(url(game, "/start-voting")).json()
    assert game["state"] == "VOTING"
    impostor_id = next(pid for pid, r in roles.items() if r["role"] == "impostor")
    return game, roles, impostor_id


def vote_and_reveal(client, game, suspects):
    ids = suspects if isinstance(suspects, list) else [suspects]
    resp = client.put(url(game, "/suspects"), json={"player_ids": ids})
    assert resp.status_code == 200, resp.text
    assert resp.json()["state"] == "IMPOSTOR_REVEAL"
    return client.post(url(game, "/reveal-impostors")).json()


# --- Role reveal & secrecy ----------------------------------------------------


def test_exactly_one_impostor_and_everyone_else_shares_the_word(client):
    game = start(client, create_game(client)["id"])
    _, roles = reveal_all_roles(client, game)

    impostors = [r for r in roles.values() if r["role"] == "impostor"]
    players = [r for r in roles.values() if r["role"] == "player"]
    assert len(impostors) == 1
    assert len({r["word"] for r in players}) == 1
    assert players[0]["word"] in ALL_TEST_WORDS


@pytest.mark.parametrize("hint", ["category", "none"])
def test_impostor_role_response_never_contains_word(client, hint):
    game = start(client, create_game(client, impostor_hint=hint)["id"])
    _, roles = reveal_all_roles(client, game)

    impostor_role = next(r for r in roles.values() if r["role"] == "impostor")
    assert "word" not in impostor_role
    assert_no_secret_word(impostor_role)
    if hint == "none":
        assert impostor_role == {"role": "impostor"}
    else:
        assert set(impostor_role) == {"role", "category"}


def test_public_game_view_hides_secrets_until_reveal(client):
    game = create_game(client)
    game = start(client, game["id"])
    assert_no_secret_word(game)
    assert game["round"]["impostor_ids"] is None

    game, _, impostor_id = play_to_voting(client, game)
    assert_no_secret_word(client.get(f"/api/games/{game['id']}").json())

    suspect = next(p["id"] for p in game["players"] if p["id"] != impostor_id)
    game = client.put(url(game, "/suspects"), json={"player_ids": [suspect]}).json()
    fetched = client.get(f"/api/games/{game['id']}").json()
    assert_no_secret_word(fetched)
    assert fetched["round"]["impostor_ids"] is None
    assert fetched["round"]["category"] is None


def test_cannot_view_another_players_role(client):
    game = start(client, create_game(client)["id"])
    second = game["players"][1]["id"]
    resp = client.get(url(game, f"/players/{second}/role"))
    assert resp.status_code == 403
    resp = client.post(url(game, f"/players/{second}/reveal-complete"))
    assert resp.status_code == 403


def test_cannot_view_role_again_after_completing_it(client):
    game = start(client, create_game(client)["id"])
    first = game["players"][0]["id"]
    client.post(url(game, f"/players/{first}/reveal-complete"))
    assert client.get(url(game, f"/players/{first}/role")).status_code == 403


def test_roles_unavailable_after_reveal_phase(client):
    game = start(client, create_game(client)["id"])
    game, _, _ = play_to_voting(client, game)
    first = game["players"][0]["id"]
    assert client.get(url(game, f"/players/{first}/role")).status_code == 409


# --- Scoring through the API ---------------------------------------------------


def test_caught_impostor_who_misses_word_gives_group_points(client):
    game = start(client, create_game(client)["id"])
    game, roles, impostor_id = play_to_voting(client, game)
    game = vote_and_reveal(client, game, impostor_id)

    assert game["state"] == "FINAL_GUESS"
    assert game["round"]["impostor_ids"] == [impostor_id]
    assert game["round"]["caught_impostor_ids"] == [impostor_id]
    assert game["round"]["secret_word"] is None  # not until the explicit word reveal

    game = client.post(url(game, "/reveal-word")).json()
    word = next(r["word"] for r in roles.values() if r["role"] == "player")
    assert game["round"]["secret_word"] == word

    game = client.post(url(game, "/final-guess"), json={"correct_player_ids": []}).json()
    assert game["state"] == "ROUND_RESULTS"
    assert game["round"]["outcome"] == "group_wins"
    scores = {p["id"]: p["score"] for p in game["players"]}
    assert scores[impostor_id] == 0
    assert all(score == 1 for pid, score in scores.items() if pid != impostor_id)
    assert game["round"]["explanation"]


def test_caught_impostor_who_guesses_word_gets_one_point(client):
    game = start(client, create_game(client)["id"])
    game, _, impostor_id = play_to_voting(client, game)
    game = vote_and_reveal(client, game, impostor_id)
    client.post(url(game, "/reveal-word"))
    game = client.post(url(game, "/final-guess"), json={"correct_player_ids": [impostor_id]}).json()

    assert game["round"]["outcome"] == "impostors_win"
    assert game["round"]["guessed_word_ids"] == [impostor_id]
    scores = {p["id"]: p["score"] for p in game["players"]}
    assert scores == {pid: (1 if pid == impostor_id else 0) for pid in scores}


def test_escaped_impostor_gets_two_points(client):
    game = start(client, create_game(client)["id"])
    game, _, impostor_id = play_to_voting(client, game)
    innocent = next(p["id"] for p in game["players"] if p["id"] != impostor_id)
    game = vote_and_reveal(client, game, innocent)

    assert game["state"] == "ROUND_RESULTS"
    assert game["round"]["caught_impostor_ids"] == []
    assert game["round"]["impostor_ids"] == [impostor_id]
    assert game["round"]["outcome"] == "impostors_win"
    assert game["round"]["secret_word"] in ALL_TEST_WORDS
    scores = {p["id"]: p["score"] for p in game["players"]}
    assert scores == {pid: (2 if pid == impostor_id else 0) for pid in scores}


# --- Full game progression ------------------------------------------------------


def play_round_escaped(client, game):
    game, _, impostor_id = play_to_voting(client, game)
    innocent = next(p["id"] for p in game["players"] if p["id"] != impostor_id)
    return vote_and_reveal(client, game, innocent)


def test_full_game_runs_to_completion_and_play_again(client):
    game = start(client, create_game(client, total_rounds=3)["id"])
    for round_number in range(1, 4):
        assert game["round"]["round_number"] == round_number
        game = play_round_escaped(client, game)
        if round_number < 3:
            assert client.post(f"/api/games/{game['id']}/finish").status_code == 409
            game = client.post(f"/api/games/{game['id']}/rounds").json()

    assert client.post(f"/api/games/{game['id']}/rounds").status_code == 409
    game = client.post(f"/api/games/{game['id']}/finish").json()
    assert game["state"] == "GAME_RESULTS"
    assert sum(p["score"] for p in game["players"]) == 6

    results = client.get(f"/api/games/{game['id']}/results").json()
    assert [r["round_number"] for r in results["rounds"]] == [1, 2, 3]
    scores = [s["score"] for s in results["standings"]]
    assert scores == sorted(scores, reverse=True)

    again = client.post(f"/api/games/{game['id']}/play-again")
    assert again.status_code == 201
    again = again.json()
    assert again["id"] != game["id"]
    assert again["state"] == "SETUP"
    assert [p["name"] for p in again["players"]] == NAMES
    assert all(p["score"] == 0 for p in again["players"])
    assert again["settings"]["total_rounds"] == 3


def test_words_do_not_repeat_while_available(client, category_ids):
    game = create_game(
        client, total_rounds=3, category_mode="specific", category_ids=[category_ids["Animals"]]
    )
    game = start(client, game["id"])
    words = []
    for round_number in range(1, 4):
        game = play_round_escaped(client, game)
        words.append(game["round"]["secret_word"])
        assert game["round"]["category"] == "Animals"
        if round_number < 3:
            game = client.post(f"/api/games/{game['id']}/rounds").json()
    assert sorted(words) == sorted(TEST_WORDS["Animals"])


def test_consecutive_impostors_differ_across_rounds(db):
    game = game_service.create_game(db, NAMES, game_service.GameSettings(total_rounds=30))
    rng = random.Random(42)
    game_service.start_game(db, game.id, rng)
    previous = None
    for round_number in range(1, 31):
        current = game.rounds[-1]
        assert current.impostor_ids != previous
        previous = current.impostor_ids
        for player in game.players:
            game_service.complete_reveal(db, game.id, player.id)
        game_service.start_clue_round(db, game.id)
        game_service.start_voting(db, game.id)
        game_service.select_suspects(db, game.id, current.impostor_ids)
        game_service.reveal_impostors(db, game.id)
        game_service.reveal_word(db, game.id)
        game_service.record_final_guess(db, game.id, [])
        if round_number < 30:
            game_service.next_round(db, game.id, rng)


def test_starting_player_is_random(client):
    # 12 games x 5 players: all starting with the same player has odds of ~1 in 50 million.
    starters = set()
    for _ in range(12):
        game = start(client, create_game(client)["id"])
        starter_id = game["round"]["starting_player_id"]
        starters.add(next(p["name"] for p in game["players"] if p["id"] == starter_id))
    assert len(starters) > 1


# --- Invalid state transitions ---------------------------------------------------


def test_cannot_vote_during_role_reveal(client):
    game = start(client, create_game(client)["id"])
    resp = client.put(url(game, "/suspects"), json={"player_ids": [game["players"][0]["id"]]})
    assert resp.status_code == 409


def test_cannot_start_next_round_during_voting(client):
    game = start(client, create_game(client)["id"])
    game, _, _ = play_to_voting(client, game)
    assert client.post(f"/api/games/{game['id']}/rounds").status_code == 409


def test_cannot_change_suspect_after_reveal(client):
    game = start(client, create_game(client)["id"])
    game, _, impostor_id = play_to_voting(client, game)
    game = vote_and_reveal(client, game, impostor_id)
    other = next(p["id"] for p in game["players"] if p["id"] != impostor_id)
    assert client.put(url(game, "/suspects"), json={"player_ids": [other]}).status_code == 409


def test_final_guess_requires_word_reveal(client):
    game = start(client, create_game(client)["id"])
    game, _, impostor_id = play_to_voting(client, game)
    game = vote_and_reveal(client, game, impostor_id)
    resp = client.post(url(game, "/final-guess"), json={"correct_player_ids": [impostor_id]})
    assert resp.status_code == 409


def test_cannot_skip_ahead_or_start_twice(client):
    game = create_game(client)
    assert client.post(url(game, "/start-voting")).status_code == 409
    game = start(client, game["id"])
    assert client.post(f"/api/games/{game['id']}/start").status_code == 409
    assert client.post(url(game, "/start-clues")).status_code == 409
    assert client.post(url(game, "/reveal-impostors")).status_code == 409


def test_players_locked_after_start(client):
    game = create_game(client)
    resp = client.put(f"/api/games/{game['id']}/players", json={"players": ["A", "B", "C", "D"]})
    assert resp.status_code == 200
    assert [p["name"] for p in resp.json()["players"]] == ["A", "B", "C", "D"]
    start(client, game["id"])
    resp = client.put(f"/api/games/{game['id']}/players", json={"players": ["A", "B", "C"]})
    assert resp.status_code == 409


def test_mixed_categories_only_use_selected_categories(client, category_ids):
    selected = [category_ids["Animals"], category_ids["Places"]]
    game = create_game(client, total_rounds=6, category_mode="specific", category_ids=selected)
    assert {c["name"] for c in game["settings"]["categories"]} == {"Animals", "Places"}
    game = start(client, game["id"])

    seen = []
    for round_number in range(1, 7):
        game = play_round_escaped(client, game)
        seen.append((game["round"]["category"], game["round"]["secret_word"]))
        if round_number < 6:
            game = client.post(f"/api/games/{game['id']}/rounds").json()

    # All six words across both categories, none from Food, no repeats.
    assert {cat for cat, _ in seen} == {"Animals", "Places"}
    assert sorted(w for _, w in seen) == sorted(TEST_WORDS["Animals"] + TEST_WORDS["Places"])


def test_random_mode_uses_every_category(client):
    game = create_game(client, total_rounds=9)
    assert game["settings"]["category_mode"] == "random"
    assert game["settings"]["categories"] == []
    game = start(client, game["id"])
    categories = set()
    for round_number in range(1, 10):
        game = play_round_escaped(client, game)
        categories.add(game["round"]["category"])
        if round_number < 9:
            game = client.post(f"/api/games/{game['id']}/rounds").json()
    assert categories == set(TEST_WORDS)


def test_play_again_keeps_enabled_categories(client, category_ids):
    selected = [category_ids["Animals"], category_ids["Food"]]
    game = start(
        client,
        create_game(client, total_rounds=1, category_mode="specific", category_ids=selected)["id"],
    )
    game = play_round_escaped(client, game)
    client.post(f"/api/games/{game['id']}/finish")
    client.patch(f"/api/categories/{category_ids['Food']}", json={"enabled": False})

    again = client.post(f"/api/games/{game['id']}/play-again").json()
    assert again["settings"]["category_mode"] == "specific"
    assert again["settings"]["category_ids"] == [category_ids["Animals"]]


def test_game_setup_validation(client, category_ids):
    assert client.post("/api/games", json={"players": ["A", "B"]}).status_code == 400
    assert client.post("/api/games", json={"players": ["A", "B", "a"]}).status_code == 400
    resp = client.post(
        "/api/games",
        json={"players": NAMES, "settings": {"category_mode": "specific"}},
    )
    assert resp.status_code == 422
    client.patch(f"/api/categories/{category_ids['Food']}", json={"enabled": False})
    resp = client.post(
        "/api/games",
        json={
            "players": NAMES,
            "settings": {
                "category_mode": "specific",
                "category_ids": [category_ids["Animals"], category_ids["Food"]],
            },
        },
    )
    assert resp.status_code == 400


# --- Multiple Impostors ----------------------------------------------------------

SEVEN = ["James", "Lloyd", "Sarah", "Mark", "Anna", "Ben", "Cara"]


def test_impostor_count_limited_by_player_count(client):
    # 5 players allow at most 2 Impostors; 3-4 players allow only 1.
    assert (
        client.post(
            "/api/games", json={"players": NAMES, "settings": {"impostor_count": 3}}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/games", json={"players": NAMES[:4], "settings": {"impostor_count": 2}}
        ).status_code
        == 400
    )
    game = create_game(client, impostor_count=2)
    assert game["settings"]["impostor_count"] == 2
    # Dropping to 4 players would break the limit.
    resp = client.put(f"/api/games/{game['id']}/players", json={"players": NAMES[:4]})
    assert resp.status_code == 400


def test_multiple_impostors_get_roles_and_no_word(client):
    game = start(client, create_game(client, players=SEVEN, impostor_count=3)["id"])
    _, roles = reveal_all_roles(client, game)
    impostors = [r for r in roles.values() if r["role"] == "impostor"]
    assert len(impostors) == 3
    assert all("word" not in r for r in impostors)
    assert_no_secret_word(impostors)
    assert len({r["word"] for r in roles.values() if r["role"] == "player"}) == 1


def test_must_accuse_one_suspect_per_impostor(client):
    game = start(client, create_game(client, players=SEVEN, impostor_count=2)["id"])
    game, _, _ = play_to_voting(client, game)
    ids = [p["id"] for p in game["players"]]
    assert client.put(url(game, "/suspects"), json={"player_ids": ids[:1]}).status_code == 400
    assert client.put(url(game, "/suspects"), json={"player_ids": ids[:3]}).status_code == 400
    assert (
        client.put(url(game, "/suspects"), json={"player_ids": [ids[0], ids[0]]}).status_code == 400
    )
    assert (
        client.put(url(game, "/suspects"), json={"player_ids": [ids[0], 99999]}).status_code == 404
    )
    assert client.put(url(game, "/suspects"), json={"player_ids": ids[:2]}).status_code == 200


def roles_by_kind(roles):
    impostors = [pid for pid, r in roles.items() if r["role"] == "impostor"]
    crew = [pid for pid, r in roles.items() if r["role"] == "player"]
    return impostors, crew


def test_split_round_scores_each_impostor_separately(client):
    game = start(client, create_game(client, players=SEVEN, impostor_count=2)["id"])
    game, roles, _ = play_to_voting(client, game)
    (caught, escaped), crew = roles_by_kind(roles)

    # Accuse one Impostor and one innocent player.
    game = vote_and_reveal(client, game, [caught, crew[0]])
    assert game["state"] == "FINAL_GUESS"
    assert sorted(game["round"]["impostor_ids"]) == sorted([caught, escaped])
    assert game["round"]["caught_impostor_ids"] == [caught]

    client.post(url(game, "/reveal-word"))
    # Only caught Impostors may be marked as guessing correctly.
    resp = client.post(url(game, "/final-guess"), json={"correct_player_ids": [escaped]})
    assert resp.status_code == 400
    game = client.post(url(game, "/final-guess"), json={"correct_player_ids": []}).json()

    assert game["round"]["outcome"] == "split"
    scores = {p["id"]: p["score"] for p in game["players"]}
    assert scores[escaped] == 2  # escaped: +2
    assert scores[caught] == 0  # caught and missed
    assert all(scores[pid] == 1 for pid in crew)  # one caught-and-missed Impostor: +1 each
    assert "escaped" in game["round"]["explanation"]


def test_all_impostors_caught_and_missing_gives_crew_a_point_each(client):
    game = start(client, create_game(client, players=SEVEN, impostor_count=2)["id"])
    game, roles, _ = play_to_voting(client, game)
    impostors, crew = roles_by_kind(roles)
    game = vote_and_reveal(client, game, impostors)
    assert sorted(game["round"]["caught_impostor_ids"]) == sorted(impostors)
    client.post(url(game, "/reveal-word"))
    guessed, missed = impostors
    game = client.post(url(game, "/final-guess"), json={"correct_player_ids": [guessed]}).json()

    scores = {p["id"]: p["score"] for p in game["players"]}
    assert scores[guessed] == 1
    assert scores[missed] == 0
    assert all(scores[pid] == 1 for pid in crew)
    assert game["round"]["guessed_word_ids"] == [guessed]


def test_nobody_caught_skips_final_guess(client):
    game = start(client, create_game(client, players=SEVEN, impostor_count=2)["id"])
    game, roles, _ = play_to_voting(client, game)
    impostors, crew = roles_by_kind(roles)
    game = vote_and_reveal(client, game, crew[:2])
    assert game["state"] == "ROUND_RESULTS"
    assert game["round"]["outcome"] == "impostors_win"
    scores = {p["id"]: p["score"] for p in game["players"]}
    assert all(scores[pid] == 2 for pid in impostors)
    assert all(scores[pid] == 0 for pid in crew)


def test_multi_impostor_results_and_play_again(client):
    game = start(client, create_game(client, players=SEVEN, impostor_count=2, total_rounds=1)["id"])
    game, roles, _ = play_to_voting(client, game)
    impostors, crew = roles_by_kind(roles)
    game = vote_and_reveal(client, game, crew[:2])
    client.post(f"/api/games/{game['id']}/finish")
    results = client.get(f"/api/games/{game['id']}/results").json()
    assert len(results["rounds"][0]["impostor_names"]) == 2
    again = client.post(f"/api/games/{game['id']}/play-again").json()
    assert again["settings"]["impostor_count"] == 2


@pytest.mark.parametrize("know_each_other", [True, False])
def test_impostors_know_each_other_option(client, know_each_other):
    game = create_game(
        client, players=SEVEN, impostor_count=3, impostors_know_each_other=know_each_other
    )
    assert game["settings"]["impostors_know_each_other"] is know_each_other
    game = start(client, game["id"])
    names = {p["id"]: p["name"] for p in game["players"]}
    game, roles = reveal_all_roles(client, game)
    impostors, crew = roles_by_kind(roles)

    for pid in impostors:
        if know_each_other:
            expected = [names[i] for i in impostors if i != pid]
            assert sorted(roles[pid]["fellow_impostors"]) == sorted(expected)
        else:
            assert "fellow_impostors" not in roles[pid]
    # Non-Impostors and the public game state never reveal who the Impostors are.
    assert all("fellow_impostors" not in roles[pid] for pid in crew)
    assert game["round"]["impostor_ids"] is None


def test_single_impostor_has_no_fellows_even_with_option(client):
    game = start(client, create_game(client, impostors_know_each_other=True)["id"])
    _, roles = reveal_all_roles(client, game)
    impostor_role = next(r for r in roles.values() if r["role"] == "impostor")
    assert "fellow_impostors" not in impostor_role
