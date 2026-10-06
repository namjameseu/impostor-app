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


def vote_and_reveal(client, game, suspect_id):
    game = client.put(url(game, "/suspect"), json={"player_id": suspect_id}).json()
    assert game["state"] == "IMPOSTOR_REVEAL"
    return client.post(url(game, "/reveal-impostor")).json()


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
    assert game["round"]["impostor_id"] is None

    game, _, impostor_id = play_to_voting(client, game)
    assert_no_secret_word(client.get(f"/api/games/{game['id']}").json())

    suspect = next(p["id"] for p in game["players"] if p["id"] != impostor_id)
    game = client.put(url(game, "/suspect"), json={"player_id": suspect}).json()
    fetched = client.get(f"/api/games/{game['id']}").json()
    assert_no_secret_word(fetched)
    assert fetched["round"]["impostor_id"] is None
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
    assert game["round"]["impostor_id"] == impostor_id
    assert game["round"]["impostor_caught"] is True
    assert game["round"]["secret_word"] is None  # not until the explicit word reveal

    game = client.post(url(game, "/reveal-word")).json()
    word = next(r["word"] for r in roles.values() if r["role"] == "player")
    assert game["round"]["secret_word"] == word

    game = client.post(url(game, "/final-guess"), json={"correct": False}).json()
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
    game = client.post(url(game, "/final-guess"), json={"correct": True}).json()

    assert game["round"]["outcome"] == "impostor_guessed_word"
    scores = {p["id"]: p["score"] for p in game["players"]}
    assert scores == {pid: (1 if pid == impostor_id else 0) for pid in scores}


def test_escaped_impostor_gets_two_points(client):
    game = start(client, create_game(client)["id"])
    game, _, impostor_id = play_to_voting(client, game)
    innocent = next(p["id"] for p in game["players"] if p["id"] != impostor_id)
    game = vote_and_reveal(client, game, innocent)

    assert game["state"] == "ROUND_RESULTS"
    assert game["round"]["impostor_caught"] is False
    assert game["round"]["impostor_id"] == impostor_id
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
        assert current.impostor_id != previous
        previous = current.impostor_id
        for player in game.players:
            game_service.complete_reveal(db, game.id, player.id)
        game_service.start_clue_round(db, game.id)
        game_service.start_voting(db, game.id)
        game_service.select_suspect(db, game.id, current.impostor_id)
        game_service.reveal_impostor(db, game.id)
        game_service.reveal_word(db, game.id)
        game_service.record_final_guess(db, game.id, correct=False)
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
    resp = client.put(url(game, "/suspect"), json={"player_id": game["players"][0]["id"]})
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
    assert client.put(url(game, "/suspect"), json={"player_id": other}).status_code == 409


def test_final_guess_requires_word_reveal(client):
    game = start(client, create_game(client)["id"])
    game, _, impostor_id = play_to_voting(client, game)
    game = vote_and_reveal(client, game, impostor_id)
    assert client.post(url(game, "/final-guess"), json={"correct": True}).status_code == 409


def test_cannot_skip_ahead_or_start_twice(client):
    game = create_game(client)
    assert client.post(url(game, "/start-voting")).status_code == 409
    game = start(client, game["id"])
    assert client.post(f"/api/games/{game['id']}/start").status_code == 409
    assert client.post(url(game, "/start-clues")).status_code == 409
    assert client.post(url(game, "/reveal-impostor")).status_code == 409


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
