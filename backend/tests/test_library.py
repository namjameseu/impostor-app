def test_category_crud_and_duplicate_names(client):
    resp = client.post("/api/categories", json={"name": "Sports", "description": "Games"})
    assert resp.status_code == 201
    category = resp.json()
    assert category["word_count"] == 0

    assert client.post("/api/categories", json={"name": "sports"}).status_code == 409

    resp = client.patch(f"/api/categories/{category['id']}", json={"enabled": False})
    assert resp.json()["enabled"] is False
    enabled_only = client.get("/api/categories", params={"include_disabled": False}).json()
    assert "Sports" not in [c["name"] for c in enabled_only]


def test_word_crud_search_and_filters(client, category_ids):
    animals = category_ids["Animals"]
    resp = client.post(
        "/api/words", json={"category_id": animals, "word": " Wombat ", "difficulty": "hard"}
    )
    assert resp.status_code == 201
    word = resp.json()
    assert word["word"] == "Wombat"
    assert word["category_name"] == "Animals"

    dup = client.post("/api/words", json={"category_id": animals, "word": "wombat"})
    assert dup.status_code == 409

    found = client.get("/api/words", params={"search": "omba"}).json()
    assert [w["word"] for w in found] == ["Wombat"]
    hard = client.get("/api/words", params={"difficulty": "hard"}).json()
    assert [w["word"] for w in hard] == ["Wombat"]
    in_food = client.get("/api/words", params={"category_id": category_ids["Food"]}).json()
    assert "Wombat" not in [w["word"] for w in in_food]

    updated = client.patch(f"/api/words/{word['id']}", json={"enabled": False}).json()
    assert updated["enabled"] is False

    assert client.delete(f"/api/words/{word['id']}").status_code == 204
    assert client.get("/api/words", params={"search": "Wombat"}).json() == []


def test_disabled_words_and_categories_are_excluded_from_listings(client, category_ids):
    for name in ("Food", "Places"):
        client.patch(f"/api/categories/{category_ids[name]}", json={"enabled": False})
    animal_words = client.get("/api/words", params={"category_id": category_ids["Animals"]}).json()
    for word in animal_words[1:]:
        client.patch(f"/api/words/{word['id']}", json={"enabled": False})

    enabled_categories = client.get("/api/categories", params={"include_disabled": False}).json()
    assert {c["name"] for c in enabled_categories} == {"Animals"}
    enabled_words = client.get(
        "/api/words", params={"category_id": category_ids["Animals"], "include_disabled": False}
    ).json()
    assert [w["word"] for w in enabled_words] == [animal_words[0]["word"]]
