"""Production concerns: admin passcode, hosted DATABASE_URL formats, serving the frontend."""

import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.core.config import _sqlalchemy_url
from app.main import app, mount_frontend


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgres://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("postgresql://u:p@h/db?sslmode=require", "postgresql+psycopg://u:p@h/db?sslmode=require"),
        ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
    ],
)
def test_hosted_database_urls_use_psycopg(given, expected):
    assert _sqlalchemy_url(given) == expected


def test_library_is_open_without_passcode(client, category_ids):
    assert client.get("/api/admin/status").json() == {"passcode_required": False}
    resp = client.post("/api/words", json={"category_id": category_ids["Animals"], "word": "Yak"})
    assert resp.status_code == 201


def test_passcode_protects_library_changes_only(client, category_ids, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_PASSCODE", "s3cret")
    animals = category_ids["Animals"]
    assert client.get("/api/admin/status").json() == {"passcode_required": True}

    # Reads and gameplay stay public.
    assert client.get("/api/words").status_code == 200
    assert client.post("/api/games", json={"players": ["A", "B", "C"]}).status_code == 201

    # Every change needs the right passcode.
    attempts = [
        ("post", "/api/categories", {"name": "Sports"}),
        ("patch", f"/api/categories/{animals}", {"enabled": False}),
        ("post", "/api/words", {"category_id": animals, "word": "Yak"}),
    ]
    for method, path, body in attempts:
        assert getattr(client, method)(path, json=body).status_code == 401
        wrong = {"X-Admin-Passcode": "nope"}
        assert getattr(client, method)(path, json=body, headers=wrong).status_code == 401
    word_id = client.get("/api/words").json()[0]["id"]
    assert client.delete(f"/api/words/{word_id}").status_code == 401

    ok = {"X-Admin-Passcode": "s3cret"}
    assert (
        client.post(
            "/api/words", json={"category_id": animals, "word": "Yak"}, headers=ok
        ).status_code
        == 201
    )
    assert client.delete(f"/api/words/{word_id}", headers=ok).status_code == 204

    assert client.post("/api/admin/verify", json={"passcode": "nope"}).status_code == 401
    assert client.post("/api/admin/verify", json={"passcode": "s3cret"}).status_code == 204


def test_serves_built_frontend_with_spa_fallback(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    (tmp_path / "sw.js").write_text("self.x=1")
    (tmp_path / "manifest.webmanifest").write_text("{}")
    routes_before = list(app.router.routes)
    mount_frontend(tmp_path)
    try:
        with TestClient(app) as client:
            assert client.get("/").text == "<html>app</html>"
            assert client.get("/game/12").text == "<html>app</html>"  # client-side route
            assert client.get("/assets/app.js").text == "console.log(1)"
            assert client.get("/favicon.svg").text == "<svg/>"
            assert client.get("/api/nope").status_code == 404  # API 404s stay JSON 404s
            assert client.get("/api/health").json() == {"status": "ok"}
            assert client.get("/../../etc/passwd").text == "<html>app</html>"
            assert client.get("/").headers["cache-control"] == "no-cache"
            assert client.get("/sw.js").headers["cache-control"] == "no-cache"
            manifest = client.get("/manifest.webmanifest")
            assert manifest.headers["content-type"].startswith("application/manifest+json")
            assert "cache-control" not in client.get("/assets/app.js").headers
    finally:
        app.router.routes[:] = routes_before
