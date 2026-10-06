import os

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import DATABASE_URL
from app.db import Base, get_db
from app.main import app
from app.models import Category, Word

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    make_url(DATABASE_URL).set(database="impostor_test").render_as_string(hide_password=False),
)

# Distinctive words so tests can assert they never leak into JSON responses.
TEST_WORDS = {
    "Animals": ["Quokka", "Axolotl", "Pangolin"],
    "Food": ["Bibingka", "Gnocchi", "Tamale"],
    "Places": ["Zanzibar", "Kathmandu", "Reykjavik"],
}


def _ensure_database(url: str) -> None:
    parsed = make_url(url)
    admin = parsed.set(drivername="postgresql", database="postgres")
    conninfo = admin.render_as_string(hide_password=False)
    with psycopg.connect(conninfo, autocommit=True) as conn:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (parsed.database,)
        ).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{parsed.database}"')


@pytest.fixture(scope="session")
def engine():
    _ensure_database(TEST_DATABASE_URL)
    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine):
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with session_factory() as session:
        _seed(session)
        yield session


def _seed(session: Session) -> None:
    for name, words in TEST_WORDS.items():
        category = Category(name=name, description=f"{name} for tests")
        category.words = [Word(word=w, difficulty="easy") for w in words]
        session.add(category)
    session.commit()


@pytest.fixture
def client(db, engine):
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def category_ids(db) -> dict[str, int]:
    return {c.name: c.id for c in db.query(Category)}
