# Impostor

A single-device, pass-the-phone party game. Everyone gets the secret word except the
Impostor(s); players give spoken clues, vote, and try to catch the liars.

Games can have several Impostors (always fewer than everyone else: 1 for 3-4 players,
2 for 5-6, 3 for 7-8...), and optionally let the Impostors know who their teammates are.

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

## Deploy for free (Render + Neon)

The root `Dockerfile` builds one production container: the React app is built and served by
FastAPI next to the API, so there is a single URL and no CORS setup. On start it runs the
migrations and the (idempotent) word seed.

**1. Database: [Neon](https://neon.com)** (free Postgres that doesn't expire)

1. Sign up and create a project (pick the region closest to your players).
2. On the project dashboard click **Connect** and copy the connection string. It looks like
   `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`.
   Use it as-is; the app switches it to the right driver itself.

**2. App: [Render](https://render.com)** (free web service)

1. Push this repo to GitHub, sign in to Render with GitHub.
2. **New → Blueprint**, pick the repo. Render reads `render.yaml` and asks for:
   - `DATABASE_URL`: the Neon connection string
   - `ADMIN_PASSCODE`: a passcode of your choice for editing the word library
3. **Apply**. The first build takes a few minutes; you then get a URL like
   `https://impostor-xxxx.onrender.com`. Open it on your phone and play.

Every `git push` to `main` redeploys automatically.

Free-tier notes:
- The Render service sleeps after 15 minutes without visitors; the first visit after that
  takes about a minute to wake up. Open it a minute before you play.
- Neon's free plan has ~0.5 GB storage, far more than this app needs.
- Without `ADMIN_PASSCODE`, anyone with the link can edit or delete words. With it, the
  Word library shows **Unlock** and asks for the passcode (remembered until the browser tab closes).

To try the production image locally:

```bash
docker compose up -d db
docker build -t impostor-prod .
docker run --rm -p 8080:8000 --network impostor-app_default \
  -e DATABASE_URL=postgresql://impostor:impostor@db:5432/impostor \
  -e ADMIN_PASSCODE=letmein impostor-prod
# open http://localhost:8080
```

## Install on a phone (PWA)

The app is a Progressive Web App: on the deployed site, Android/Chrome shows **📲 Install app**
on the home screen; on iPhone, tap **Share → Add to Home Screen**. It then opens full-screen
like a native app. Notes:

- The app shell is cached, so it opens instantly (and even offline), but games and words always
  come live from the server - an internet connection is still needed to play.
- New deploys download in the background and apply the next time the app is opened.
- During a game the screen is kept awake (Screen Wake Lock), so it doesn't dim while the phone
  is passed around or lying on the table.
- Icons are generated from `frontend/public/favicon.svg`; after changing the logo run
  `npx pwa-assets-generator` in `frontend/`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

- **Backend**: ruff lint/format, migrations up → down → up on a real Postgres, seed twice, pytest
- **Frontend**: oxlint, type-check and build
- **Docker**: the production image builds

`render.yaml` sets `autoDeployTrigger: checksPass`, so Render only deploys commits whose checks
all pass. A red ❌ next to a commit on GitHub means it was *not* deployed; the live site keeps
running the last good version.

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
- `GET …/players/{id}/role` is the only endpoint that returns a word, and for an Impostor it
  returns `{"role": "impostor", "category"?: …, "fellow_impostors"?: [...]}` — the word is never
  sent to that client. `fellow_impostors` is only included when "Impostors know each other" is on.

### Scoring

The group accuses one suspect per Impostor. Each caught Impostor then gets one spoken guess
at the word. Points are worked out per Impostor and added together:

| Each Impostor who… | Points |
| --- | --- |
| was caught and missed the word | every non-Impostor +1 |
| was not caught | that Impostor +2 |
| was caught but guessed the word | that Impostor +1 |

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
| PUT | `/api/games/{id}/rounds/current/suspects` | `{"player_ids": [...]}`, one per Impostor |
| POST | `/api/games/{id}/rounds/current/reveal-impostors` | reveal; scores now if nobody was caught |
| POST | `/api/games/{id}/rounds/current/reveal-word` | show the word for the final guess |
| POST | `/api/games/{id}/rounds/current/final-guess` | `{"correct_player_ids": [...]}`; scores the round |
| POST | `/api/games/{id}/rounds` | start the next round |
| POST | `/api/games/{id}/finish` | end after the last round |
| GET | `/api/games/{id}/results` | standings + round history |
| GET | `/api/admin/status` | whether library edits need a passcode |
| POST | `/api/admin/verify` | check a passcode (send it as `X-Admin-Passcode` on library edits) |
| POST | `/api/games/{id}/play-again` | new game, same players and settings |

### Code layout

```
backend/app/
  game/        pure rules: state machine, round_manager, word_selector, scoring (no DB/HTTP)
  services/    loads/saves models and calls the game rules; builds secret-safe views
  api/         thin FastAPI routers
  models/      SQLAlchemy models (categories, words, games, game_categories, game_players,
               rounds, round_impostors, round_suspects)
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
