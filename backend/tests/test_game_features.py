"""Similar Word mode, players joining/leaving between rounds, stats and cleanup."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import update

from app.db.cleanup import cleanup
from app.models import Game, Word
from tests.conftest import TEST_WORDS
from tests.test_game_flow import (
    NAMES,
    SEVEN,
    create_game,
    play_round_escaped,
    play_to_voting,
    reveal_all_roles,
    start,
    url,
    vote_and_reveal,
)

# --- Similar Word mode --------------------------------------------------------


def test_similar_word_mode_gives_impostor_a_related_word_in_player_form(client, db):
    db.execute(update(Word).where(Word.word == "Quokka").values(similar_word="Wallaby"))
    db.commit()
    game = create_game(
        client,
        impostor_mode="similar_word",
        impostors_know_each_other=True,  # ignored in this mode
        category_mode="specific",
        category_ids=[db.query(Word).filter_by(word="Quokka").one().category_id],
        total_rounds=3,
    )
    assert game["settings"]["impostor_mode"] == "similar_word"
    assert game["settings"]["impostors_know_each_other"] is False
    game = start(client, game["id"])

    for round_number in range(1, 4):
        game, roles = reveal_all_roles(client, game)
        # Every role has the same shape: nothing tells the Impostor what they are.
        assert all(
            r["role"] == "player" and set(r) == {"role", "category", "word"} for r in roles.values()
        )
        assert len({r["category"] for r in roles.values()}) == 1
        words = [r["word"] for r in roles.values()]
        secret = max(set(words), key=words.count)
        impostor_words = [w for w in words if w != secret]
        assert len(impostor_words) == 1  # exactly one player got the related word
        if secret == "Quokka":
            assert impostor_words == ["Wallaby"]
        else:
            assert impostor_words[0] in TEST_WORDS["Animals"]  # same-category fallback
        assert game["round"]["impostor_word"] is None  # hidden until the reveal

        impostor_id = next(pid for pid, r in roles.items() if r["word"] != secret)
        client.post(url(game, "/start-clues"))
        game = client.post(url(game, "/start-voting")).json()
        innocent = next(p["id"] for p in game["players"] if p["id"] != impostor_id)
        game = vote_and_reveal(client, game, innocent)
        assert game["round"]["secret_word"] == secret
        assert game["round"]["impostor_word"] == impostor_words[0]
        assert game["round"]["impostor_ids"] == [impostor_id]
        if round_number < 3:
            game = client.post(f"/api/games/{game['id']}/rounds").json()


def test_library_words_store_similar_word(client, category_ids):
    word = client.post(
        "/api/words",
        json={"category_id": category_ids["Animals"], "word": "Llama", "similar_word": " Alpaca "},
    ).json()
    assert word["similar_word"] == "Alpaca"
    word = client.patch(f"/api/words/{word['id']}", json={"similar_word": "Camel"}).json()
    assert word["similar_word"] == "Camel"


# --- Players joining / leaving between rounds -----------------------------------


def test_player_leaves_between_rounds(client):
    game = start(client, create_game(client, players=NAMES, total_rounds=3)["id"])
    game = play_round_escaped(client, game)
    leaver = game["players"][1]
    scores_before = {p["id"]: p["score"] for p in game["players"]}

    game = client.delete(f"/api/games/{game['id']}/players/{leaver['id']}").json()
    left = next(p for p in game["players"] if p["id"] == leaver["id"])
    assert left["active"] is False and left["score"] == scores_before[leaver["id"]]
    # The finished round keeps its original points, including the player who left.
    assert {int(k): v for k, v in game["round"]["points"].items()} == scores_before

    game = client.post(f"/api/games/{game['id']}/rounds").json()
    game, roles = reveal_all_roles(client, game)
    assert leaver["id"] not in roles and len(roles) == 4
    game = client.post(url(game, "/start-clues")).json()
    game = client.post(url(game, "/start-voting")).json()
    resp = client.put(url(game, "/suspects"), json={"player_ids": [leaver["id"]]})
    assert resp.status_code == 404  # can't accuse someone who left


def test_late_player_joins_with_zero_and_past_rounds_unchanged(client):
    game = start(client, create_game(client, players=NAMES[:3], total_rounds=3)["id"])
    game = play_round_escaped(client, game)
    first_round_points = game["round"]["points"]

    game = client.post(f"/api/games/{game['id']}/players", json={"name": "Zoe"})
    assert game.status_code == 201
    game = game.json()
    zoe = next(p for p in game["players"] if p["name"] == "Zoe")
    assert zoe["score"] == 0 and zoe["active"]
    assert game["round"]["points"] == first_round_points  # Zoe gets nothing for round 1

    game = client.post(f"/api/games/{game['id']}/rounds").json()
    _, roles = reveal_all_roles(client, game)
    assert zoe["id"] in roles


def test_player_changes_validation(client):
    game = create_game(client, players=SEVEN, impostor_count=3, total_rounds=2)
    game_id = game["id"]
    # Re-adding a current player's name is rejected.
    assert client.post(f"/api/games/{game_id}/players", json={"name": "anna"}).status_code == 400
    game = start(client, game_id)
    # Not allowed in the middle of a round.
    assert client.post(f"/api/games/{game_id}/players", json={"name": "Zed"}).status_code == 409
    assert (
        client.delete(f"/api/games/{game_id}/players/{game['players'][0]['id']}").status_code == 409
    )

    game, _, _ = play_to_voting(client, game)
    game = vote_and_reveal(client, game, [p["id"] for p in game["players"][:3]])
    if game["state"] == "FINAL_GUESS":
        client.post(url(game, "/reveal-word"))
        game = client.post(url(game, "/final-guess"), json={"correct_player_ids": []}).json()
    assert game["state"] == "ROUND_RESULTS"

    # 7 -> 6 players: 3 Impostors no longer allowed, so it drops to 2.
    leaver = game["players"][0]
    game = client.delete(f"/api/games/{game_id}/players/{leaver['id']}").json()
    assert game["settings"]["impostor_count"] == 2
    # A player who left can come back with their score.
    back = client.post(
        f"/api/games/{game_id}/players", json={"name": leaver["name"].upper()}
    ).json()
    returned = next(p for p in back["players"] if p["id"] == leaver["id"])
    assert returned["active"] and returned["score"] == leaver["score"]


def test_cannot_drop_below_minimum_players(client):
    game = create_game(client, players=NAMES[:3])
    resp = client.delete(f"/api/games/{game['id']}/players/{game['players'][0]['id']}")
    assert resp.status_code == 400


def test_play_again_skips_players_who_left(client):
    game = start(client, create_game(client, players=NAMES, total_rounds=1)["id"])
    game = play_round_escaped(client, game)
    client.delete(f"/api/games/{game['id']}/players/{game['players'][0]['id']}")
    client.post(f"/api/games/{game['id']}/finish")
    again = client.post(f"/api/games/{game['id']}/play-again").json()
    assert [p["name"] for p in again["players"]] == NAMES[1:]


# --- Stats ---------------------------------------------------------------------------


def test_stats_across_games(client):
    ids = []
    for players in (NAMES, [n.lower() for n in NAMES]):  # same people, different case
        game = start(client, create_game(client, players=players, total_rounds=2)["id"])
        ids.append(game["id"])
        for round_number in (1, 2):
            game = play_round_escaped(client, game)  # Impostor always escapes: +2
            if round_number == 1:
                game = client.post(f"/api/games/{game['id']}/rounds").json()
        client.post(f"/api/games/{game['id']}/finish")

    stats = client.get("/api/stats", params={"game_ids": ids}).json()
    assert stats["games"] == 2 and stats["finished_games"] == 2
    assert len(stats["players"]) == 5  # names merged case-insensitively
    total = {k: sum(p[k] for p in stats["players"]) for k in stats["players"][0] if k != "name"}
    assert total["rounds"] == 2 * 2 * 5
    assert total["impostor_rounds"] == total["escaped"] == 4
    assert total["caught"] == 0
    assert total["points"] == 4 * 2
    assert total["wins"] >= 2
    for player in stats["players"]:
        assert player["games"] == 2

    # Only the requested games count.
    assert client.get("/api/stats", params={"game_ids": [ids[0]]}).json()["games"] == 1
    assert client.get("/api/stats").json()["players"] == []


# --- Cleanup ---------------------------------------------------------------------


def test_cleanup_removes_abandoned_and_very_old_games(client, db):
    now = datetime.now(UTC)
    fresh = create_game(client)["id"]
    abandoned = create_game(client)["id"]
    old_finished = start(client, create_game(client, total_rounds=1)["id"])
    old_finished = play_round_escaped(client, old_finished)
    client.post(f"/api/games/{old_finished['id']}/finish")
    recent_finished = start(client, create_game(client, total_rounds=1)["id"])
    recent_finished = play_round_escaped(client, recent_finished)
    client.post(f"/api/games/{recent_finished['id']}/finish")

    db.execute(update(Game).where(Game.id == abandoned).values(updated_at=now - timedelta(days=8)))
    db.execute(
        update(Game)
        .where(Game.id == old_finished["id"])
        .values(finished_at=now - timedelta(days=400), updated_at=now - timedelta(days=400))
    )
    db.commit()

    assert cleanup(db, abandoned_days=7, finished_days=365, now=now) == 2
    remaining = {g.id for g in db.query(Game)}
    assert remaining == {fresh, recent_finished["id"]}
