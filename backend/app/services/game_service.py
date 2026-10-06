"""Game orchestration: loads/saves game data and delegates every rule to app.game."""

import random
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.game import round_manager, scoring
from app.game.errors import GameValidationError, InvalidStateError, NotFoundError, RoleAccessError
from app.game.game_engine import (
    GameState,
    has_more_rounds,
    is_impostor_visible,
    is_word_visible,
    require_state,
    transition,
    validate_player_names,
)
from app.game.round_manager import RoleView, system_rng
from app.game.settings import CategoryMode
from app.game.word_selector import WordCandidate, select_word
from app.models import Category, Game, GamePlayer, Round, Word
from app.schemas.game import (
    CategoryRef,
    GameRead,
    GameResults,
    GameSettings,
    PlayerRead,
    RoundRead,
    RoundSummary,
    SettingsRead,
    StandingRead,
)

# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


def get_game(db: Session, game_id: int, *, lock: bool = False) -> Game:
    stmt = select(Game).where(Game.id == game_id)
    if lock:
        # Serialises actions on one game so a double-tap can't apply a transition twice.
        stmt = stmt.with_for_update()
    game = db.scalars(stmt).one_or_none()
    if game is None:
        raise NotFoundError("Game not found.")
    return game


def _current_round(game: Game) -> Round:
    if not game.rounds:
        raise InvalidStateError("The game has not started yet.")
    return game.rounds[-1]


def _player(game: Game, player_id: int) -> GamePlayer:
    for player in game.players:
        if player.id == player_id:
            return player
    raise NotFoundError("Player not found in this game.")


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------


def _selected_categories(db: Session, settings: GameSettings) -> list[Category]:
    if settings.category_mode != CategoryMode.SPECIFIC:
        return []
    categories = db.scalars(
        select(Category).where(Category.id.in_(settings.category_ids), Category.enabled)
    ).all()
    if len(categories) != len(settings.category_ids):
        raise GameValidationError("A selected category does not exist or is disabled.")
    return list(categories)


def _set_players(game: Game, names: list[str]) -> None:
    game.players = [
        GamePlayer(name=name, order_index=index, score=0) for index, name in enumerate(names)
    ]


def create_game(db: Session, names: list[str], settings: GameSettings) -> Game:
    cleaned = validate_player_names(names)
    categories = _selected_categories(db, settings)
    game = Game(state=GameState.SETUP, **settings.model_dump(exclude={"category_ids"}))
    game.categories = categories
    _set_players(game, cleaned)
    db.add(game)
    db.commit()
    return game


def replace_players(db: Session, game_id: int, names: list[str]) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.SETUP, action="change players")
    cleaned = validate_player_names(names)
    game.players = []
    db.flush()  # delete old rows first so (game_id, order_index) stays unique
    _set_players(game, cleaned)
    db.commit()
    return game


def start_game(db: Session, game_id: int, rng: random.Random = system_rng) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.SETUP, action="start the game")
    _generate_round(db, game, rng)
    db.commit()
    return game


def play_again(db: Session, game_id: int) -> Game:
    """Create a fresh game with the same players (in order) and settings."""
    old = get_game(db, game_id)
    require_state(old.state, GameState.GAME_RESULTS, action="play again")
    # Drop categories disabled since; fall back to random if none are left.
    category_ids = [c.id for c in old.categories if c.enabled]
    settings = GameSettings(
        total_rounds=old.total_rounds,
        category_mode=CategoryMode.SPECIFIC if category_ids else CategoryMode.RANDOM,
        category_ids=category_ids,
        impostor_hint=old.impostor_hint,
    )
    return create_game(db, [p.name for p in old.players], settings)


# ---------------------------------------------------------------------------
# Round generation
# ---------------------------------------------------------------------------


def _word_candidates(db: Session, game: Game) -> list[WordCandidate]:
    stmt = (
        select(Word.id, Word.word, Category.id, Category.name)
        .join(Word.category)
        .where(Word.enabled, Category.enabled)
    )
    if game.category_mode == CategoryMode.SPECIFIC:
        stmt = stmt.where(Category.id.in_([c.id for c in game.categories]))
    return [WordCandidate(*row) for row in db.execute(stmt)]


def _generate_round(db: Session, game: Game, rng: random.Random) -> Round:
    previous = game.rounds[-1] if game.rounds else None
    used_word_ids = {r.word_id for r in game.rounds if r.word_id is not None}
    word = select_word(_word_candidates(db, game), used_word_ids, rng)

    ordered_ids = [p.id for p in game.players]
    impostor_id = round_manager.choose_impostor(
        ordered_ids, previous.impostor_id if previous else None, rng
    )
    starting_id = round_manager.choose_starting_player(ordered_ids, rng)

    game.state = transition(game.state, GameState.ROLE_REVEAL)
    game.current_round_number += 1
    new_round = Round(
        round_number=game.current_round_number,
        category_id=word.category_id,
        category_name=word.category_name,
        word_id=word.id,
        secret_word=word.word,
        impostor_id=impostor_id,
        starting_player_id=starting_id,
    )
    game.rounds.append(new_round)
    return new_round


# ---------------------------------------------------------------------------
# Role reveal
# ---------------------------------------------------------------------------


def _require_revealer(game: Game, player_id: int) -> Round:
    require_state(game.state, GameState.ROLE_REVEAL, action="view a role")
    current = _current_round(game)
    _player(game, player_id)
    if game.players[current.reveal_index].id != player_id:
        raise RoleAccessError("It is not this player's turn to view their role.")
    return current


def get_player_role(db: Session, game_id: int, player_id: int) -> RoleView:
    game = get_game(db, game_id)
    current = _require_revealer(game, player_id)
    return round_manager.build_role_view(
        is_impostor=current.impostor_id == player_id,
        secret_word=current.secret_word,
        category=current.category_name,
        impostor_hint=game.impostor_hint,
    )


def complete_reveal(db: Session, game_id: int, player_id: int) -> Game:
    game = get_game(db, game_id, lock=True)
    current = _require_revealer(game, player_id)
    current.reveal_index += 1
    if current.reveal_index == len(game.players):
        game.state = transition(game.state, GameState.READY)
    db.commit()
    return game


# ---------------------------------------------------------------------------
# Clues, voting and reveal
# ---------------------------------------------------------------------------


def start_clue_round(db: Session, game_id: int) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.READY, action="start the clue round")
    game.state = transition(game.state, GameState.CLUE_ROUND)
    db.commit()
    return game


def start_voting(db: Session, game_id: int) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.CLUE_ROUND, action="start voting")
    game.state = transition(game.state, GameState.VOTING)
    db.commit()
    return game


def select_suspect(db: Session, game_id: int, player_id: int) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.VOTING, action="select a suspect")
    _player(game, player_id)
    _current_round(game).suspect_id = player_id
    game.state = transition(game.state, GameState.IMPOSTOR_REVEAL)
    db.commit()
    return game


def _finish_round(game: Game, current: Round, outcome: scoring.RoundOutcome) -> None:
    points = scoring.round_points([p.id for p in game.players], current.impostor_id, outcome)
    for player in game.players:
        player.score += points[player.id]
    current.outcome = outcome
    current.completed_at = datetime.now(UTC)
    game.state = transition(game.state, GameState.ROUND_RESULTS)


def reveal_impostor(db: Session, game_id: int) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.IMPOSTOR_REVEAL, action="reveal the Impostor")
    current = _current_round(game)
    current.impostor_caught = current.suspect_id == current.impostor_id
    if current.impostor_caught:
        game.state = transition(game.state, GameState.FINAL_GUESS)
    else:
        _finish_round(game, current, scoring.determine_outcome(False, None))
    db.commit()
    return game


def reveal_word(db: Session, game_id: int) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.FINAL_GUESS, action="reveal the word")
    _current_round(game).word_revealed = True
    db.commit()
    return game


def record_final_guess(db: Session, game_id: int, correct: bool) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.FINAL_GUESS, action="record the final guess")
    current = _current_round(game)
    if not current.word_revealed:
        raise InvalidStateError("Reveal the word before recording the final guess.")
    current.final_guess_correct = correct
    _finish_round(game, current, scoring.determine_outcome(True, correct))
    db.commit()
    return game


# ---------------------------------------------------------------------------
# Round / game progression
# ---------------------------------------------------------------------------


def next_round(db: Session, game_id: int, rng: random.Random = system_rng) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.ROUND_RESULTS, action="start the next round")
    if not has_more_rounds(game.current_round_number, game.total_rounds):
        raise InvalidStateError("All rounds have been played. Finish the game instead.")
    _generate_round(db, game, rng)
    db.commit()
    return game


def finish_game(db: Session, game_id: int) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.ROUND_RESULTS, action="finish the game")
    if has_more_rounds(game.current_round_number, game.total_rounds):
        raise InvalidStateError("There are still rounds left to play.")
    game.state = transition(game.state, GameState.GAME_RESULTS)
    game.finished_at = datetime.now(UTC)
    db.commit()
    return game


# ---------------------------------------------------------------------------
# Public views (never include secrets the current state doesn't allow)
# ---------------------------------------------------------------------------


def _round_read(game: Game, current: Round) -> RoundRead:
    players = game.players
    view = RoundRead(
        round_number=current.round_number,
        starting_player_id=current.starting_player_id,
        revealed_count=current.reveal_index,
        suspect_id=current.suspect_id,
        word_revealed=current.word_revealed,
    )
    if game.state == GameState.ROLE_REVEAL:
        view.revealer_id = players[current.reveal_index].id
        if current.reveal_index + 1 < len(players):
            view.next_revealer_id = players[current.reveal_index + 1].id
    if is_impostor_visible(game.state):
        view.impostor_id = current.impostor_id
        view.impostor_caught = current.impostor_caught
    if is_word_visible(game.state, current.word_revealed):
        view.secret_word = current.secret_word
        view.category = current.category_name
    if current.outcome is not None:
        outcome = scoring.RoundOutcome(current.outcome)
        view.final_guess_correct = current.final_guess_correct
        view.outcome = outcome
        view.points = scoring.round_points([p.id for p in players], current.impostor_id, outcome)
        view.explanation = scoring.explain_outcome(outcome, _player(game, current.impostor_id).name)
    return view


def to_game_read(game: Game) -> GameRead:
    return GameRead(
        id=game.id,
        state=game.state,
        total_rounds=game.total_rounds,
        current_round_number=game.current_round_number,
        settings=SettingsRead(
            total_rounds=game.total_rounds,
            category_mode=game.category_mode,
            category_ids=[c.id for c in game.categories],
            categories=[CategoryRef(id=c.id, name=c.name) for c in game.categories],
            impostor_hint=game.impostor_hint,
        ),
        players=[
            PlayerRead(id=p.id, name=p.name, order_index=p.order_index, score=p.score)
            for p in game.players
        ],
        round=_round_read(game, game.rounds[-1]) if game.rounds else None,
    )


def get_results(db: Session, game_id: int) -> GameResults:
    game = get_game(db, game_id)
    names = {p.id: p.name for p in game.players}
    standings = scoring.rank_players([(p.id, p.name, p.score, p.order_index) for p in game.players])
    return GameResults(
        game_id=game.id,
        state=game.state,
        standings=[StandingRead(**vars(s)) for s in standings],
        rounds=[
            RoundSummary(
                round_number=r.round_number,
                category=r.category_name,
                secret_word=r.secret_word,
                impostor_id=r.impostor_id,
                impostor_name=names[r.impostor_id],
                suspect_id=r.suspect_id,
                outcome=r.outcome,
                explanation=scoring.explain_outcome(
                    scoring.RoundOutcome(r.outcome), names[r.impostor_id]
                ),
            )
            for r in game.rounds
            if r.outcome is not None
        ],
    )
