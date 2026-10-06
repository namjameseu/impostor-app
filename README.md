# Impostor

A single-device, pass-the-phone party game. Everyone gets the secret word except one
Impostor; players give spoken clues, vote, and try to catch the liar.

- **frontend/** – React + TypeScript + Vite + Tailwind CSS (http://localhost:5173)
- **backend/** – FastAPI + SQLAlchemy + Alembic (http://localhost:8000, API docs at `/docs`)
- **db** – PostgreSQL 16 (host port `5440`)

## Run with Docker (everything)

```bash
cp .env.example .env        # optional; defaults work for local dev
docker compose up --build
```

Open http://localhost:5173. The backend applies migrations and seeds the word library on start.
Both servers hot-reload when you edit files.

## Run locally (Git Bash on Windows)

```bash
docker compose up -d db                     # just the database

cd backend
source venv/Scripts/activate                # cmd: venv\Scripts\activate · PowerShell: venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
cp .env.example .env                        # first time only
alembic upgrade head
python -m app.db.seed                       # idempotent
uvicorn app.main:app --reload

cd frontend                                 # in a second terminal
npm install
npm run dev
```

Don't run the Docker `backend`/`frontend` services at the same time as the local ones — they share ports 8000/5173.

## Checks

```bash
cd backend && pytest            # game engine + API tests (uses an `impostor_test` database it creates)
cd backend && ruff check .
cd frontend && npm run build    # type-check + build
cd frontend && npm run lint
```

Inside Docker: `docker compose exec backend pytest`.

## How it fits together

### Game state machine (backend-enforced)

```
SETUP → ROLE_REVEAL → READY → CLUE_ROUND → VOTING → IMPOSTOR_REVEAL ─┬→ FINAL_GUESS → ROUND_RESULTS
                                                                     └──────────────→ ROUND_RESULTS
ROUND_RESULTS → ROLE_REVEAL (next round)  |  → GAME_RESULTS (after the last round)
```

Any action that doesn't match the current state returns **409**. During `ROLE_REVEAL` only the
player whose turn it is can fetch their role (**403** otherwise), and only once.

### Secrecy

- The secret word and the Impostor's identity are never in the public game payload until the
  state allows it (`FINAL_GUESS` after the explicit word reveal, or `ROUND_RESULTS`).
- `GET …/players/{id}/role` is the only endpoint that returns a word, and for the Impostor it
  returns `{"role": "impostor", "category"?: …}` — the word is never sent to that client.

### Scoring

| Outcome | Points |
| --- | --- |
| Impostor caught and misses the word | every other player +1 |
| Impostor not caught | Impostor +2 |
| Impostor caught but guesses the word | Impostor +1 |

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/categories` | list / create categories |
| PATCH | `/api/categories/{id}` | edit / enable / disable |
| GET/POST | `/api/words` | list (`category_id`, `difficulty`, `search`) / create |
| PATCH/DELETE | `/api/words/{id}` | edit / enable / disable / delete |
| POST | `/api/games` | create game with players + settings (`SETUP`) |
| GET | `/api/games/{id}` | public game state |
| PUT | `/api/games/{id}/players` | replace players (only in `SETUP`) |
| POST | `/api/games/{id}/start` | generate round 1 |
| GET | `/api/games/{id}/rounds/current/players/{pid}/role` | private role for the current revealer |
| POST | `/api/games/{id}/rounds/current/players/{pid}/reveal-complete` | hand the phone on |
| POST | `/api/games/{id}/rounds/current/start-clues` | `READY → CLUE_ROUND` |
| POST | `/api/games/{id}/rounds/current/start-voting` | `CLUE_ROUND → VOTING` |
| PUT | `/api/games/{id}/rounds/current/suspect` | lock in the group's suspect |
| POST | `/api/games/{id}/rounds/current/reveal-impostor` | reveal; scores if the Impostor escaped |
| POST | `/api/games/{id}/rounds/current/reveal-word` | show the word for the final guess |
| POST | `/api/games/{id}/rounds/current/final-guess` | `{"correct": bool}`; scores the round |
| POST | `/api/games/{id}/rounds` | start the next round |
| POST | `/api/games/{id}/finish` | end after the last round |
| GET | `/api/games/{id}/results` | standings + round history |
| POST | `/api/games/{id}/play-again` | new game, same players and settings |

### Code layout

```
backend/app/
  game/        pure rules: state machine, round_manager, word_selector, scoring (no DB/HTTP)
  services/    loads/saves models and calls the game rules; builds secret-safe views
  api/         thin FastAPI routers
  models/      SQLAlchemy models (categories, words, games, game_categories, game_players, rounds)
  schemas/     Pydantic request/response models
  db/          engine/session, seed data
frontend/src/
  pages/game/  one screen per game state
  services/    API client
  stores/      setup (players/settings) context, persisted to localStorage
  components/  Button, Screen, HoldToReveal, …
```

## Database migrations

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```
