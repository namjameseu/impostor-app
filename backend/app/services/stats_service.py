"""Player stats across a set of games (the games played on one device).

Players aren't accounts, so stats are grouped by name (case-insensitive).
Only completed rounds count; a round's saved points also record who took part in it.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.game import scoring
from app.game.game_engine import GameState
from app.models import Game, Round
from app.schemas.stats import PlayerStats, StatsRead

MAX_GAMES = 500


@dataclass
class _Totals:
    name: str
    games: set[int] = field(default_factory=set)
    wins: int = 0
    rounds: int = 0
    points: int = 0
    impostor_rounds: int = 0
    escaped: int = 0
    caught: int = 0
    guessed_word: int = 0


def player_stats(db: Session, game_ids: Sequence[int]) -> StatsRead:
    ids = list(dict.fromkeys(game_ids))[:MAX_GAMES]
    games = db.scalars(
        select(Game)
        .where(Game.id.in_(ids))
        .options(
            selectinload(Game.players),
            selectinload(Game.rounds).selectinload(Round.impostors),
            selectinload(Game.rounds).selectinload(Round.suspects),
        )
    ).all()

    totals: dict[str, _Totals] = {}

    def entry(name: str) -> _Totals:
        key = name.casefold()
        if key not in totals:
            totals[key] = _Totals(name=name)
        return totals[key]

    finished_games = 0
    for game in games:
        names = {p.id: p.name for p in game.players}
        if game.state == GameState.GAME_RESULTS:
            finished_games += 1
            standings = scoring.rank_players(
                [(p.id, p.name, p.score, p.order_index) for p in game.players]
            )
            for s in standings:
                if s.rank == 1:
                    entry(s.name).wins += 1

        for rnd in game.rounds:
            if rnd.outcome is None:
                continue
            for pid, pts in rnd.points_by_player.items():
                player = entry(names[pid])
                player.games.add(game.id)
                player.rounds += 1
                player.points += pts
            for impostor in rnd.impostors:
                player = entry(names[impostor.player_id])
                player.impostor_rounds += 1
                if rnd.is_caught(impostor.player_id):
                    player.caught += 1
                    player.guessed_word += bool(impostor.guessed_word)
                else:
                    player.escaped += 1

    players = [
        PlayerStats(
            name=t.name,
            games=len(t.games),
            wins=t.wins,
            rounds=t.rounds,
            points=t.points,
            impostor_rounds=t.impostor_rounds,
            escaped=t.escaped,
            caught=t.caught,
            guessed_word=t.guessed_word,
        )
        for t in totals.values()
        if t.rounds
    ]
    players.sort(key=lambda p: (-p.wins, -p.points, p.name.casefold()))
    return StatsRead(games=len(games), finished_games=finished_games, players=players)
