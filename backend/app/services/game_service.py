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
    validate_impostor_count,
    validate_player_names,
)
from app.game.round_manager import RoleView, system_rng
from app.game.settings import CategoryMode
from app.game.word_selector import WordCandidate, select_word
from app.models import Category, Game, GamePlayer, Round, RoundImpostor, RoundSuspect, Word
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
    validate_impostor_count(settings.impostor_count, len(cleaned))
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
    validate_impostor_count(game.impostor_count, len(cleaned))
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
        impostor_count=old.impostor_count,
        impostors_know_each_other=old.impostors_know_each_other,
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
    impostor_ids = round_manager.choose_impostors(
        ordered_ids, game.impostor_count, previous.impostor_ids if previous else (), rng
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
        starting_player_id=starting_id,
        impostors=[RoundImpostor(player_id=pid) for pid in impostor_ids],
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
    is_impostor = player_id in current.impostor_ids
    fellows = None
    if is_impostor and game.impostors_know_each_other and game.impostor_count > 1:
        fellows = [
            p.name for p in game.players if p.id in current.impostor_ids and p.id != player_id
        ]
    return round_manager.build_role_view(
        is_impostor=is_impostor,
        secret_word=current.secret_word,
        category=current.category_name,
        impostor_hint=game.impostor_hint,
        fellow_impostors=fellows,
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


def select_suspects(db: Session, game_id: int, player_ids: list[int]) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.VOTING, action="select suspects")
    if len(set(player_ids)) != len(player_ids):
        raise GameValidationError("Each suspect can only be chosen once.")
    if len(player_ids) != game.impostor_count:
        raise GameValidationError(
            f"Choose exactly {game.impostor_count} suspect"
            f"{'s' if game.impostor_count > 1 else ''}, one per Impostor."
        )
    for pid in player_ids:
        _player(game, pid)
    _current_round(game).suspects = [RoundSuspect(player_id=pid) for pid in player_ids]
    game.state = transition(game.state, GameState.IMPOSTOR_REVEAL)
    db.commit()
    return game


def _impostor_results(current: Round) -> dict[int, scoring.ImpostorResult]:
    return {
        i.player_id: scoring.impostor_result(current.is_caught(i.player_id), i.guessed_word)
        for i in current.impostors
    }


def _finish_round(game: Game, current: Round) -> None:
    results = _impostor_results(current)
    points = scoring.round_points([p.id for p in game.players], results)
    for player in game.players:
        player.score += points[player.id]
    current.outcome = scoring.round_outcome(results)
    current.completed_at = datetime.now(UTC)
    game.state = transition(game.state, GameState.ROUND_RESULTS)


def reveal_impostors(db: Session, game_id: int) -> Game:
    """Reveal who the Impostors were. Caught Impostors get a final guess; else score now."""
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.IMPOSTOR_REVEAL, action="reveal the Impostors")
    current = _current_round(game)
    if any(current.is_caught(pid) for pid in current.impostor_ids):
        game.state = transition(game.state, GameState.FINAL_GUESS)
    else:
        _finish_round(game, current)
    db.commit()
    return game


def reveal_word(db: Session, game_id: int) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.FINAL_GUESS, action="reveal the word")
    _current_round(game).word_revealed = True
    db.commit()
    return game


def record_final_guess(db: Session, game_id: int, correct_player_ids: list[int]) -> Game:
    game = get_game(db, game_id, lock=True)
    require_state(game.state, GameState.FINAL_GUESS, action="record the final guess")
    current = _current_round(game)
    if not current.word_revealed:
        raise InvalidStateError("Reveal the word before recording the final guess.")
    caught = [i for i in current.impostors if current.is_caught(i.player_id)]
    if not set(correct_player_ids) <= {i.player_id for i in caught}:
        raise GameValidationError("Only caught Impostors can make a final guess.")
    for impostor in caught:
        impostor.guessed_word = impostor.player_id in correct_player_ids
    _finish_round(game, current)
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


def _in_player_order(game: Game, ids: list[int]) -> list[int]:
    return [p.id for p in game.players if p.id in ids]


def _round_read(game: Game, current: Round) -> RoundRead:
    players = game.players
    view = RoundRead(
        round_number=current.round_number,
        starting_player_id=current.starting_player_id,
        revealed_count=current.reveal_index,
        suspect_ids=_in_player_order(game, current.suspect_ids),
        word_revealed=current.word_revealed,
    )
    if game.state == GameState.ROLE_REVEAL:
        view.revealer_id = players[current.reveal_index].id
        if current.reveal_index + 1 < len(players):
            view.next_revealer_id = players[current.reveal_index + 1].id
    if is_impostor_visible(game.state):
        view.impostor_ids = _in_player_order(game, current.impostor_ids)
        view.caught_impostor_ids = [pid for pid in view.impostor_ids if current.is_caught(pid)]
    if is_word_visible(game.state, current.word_revealed):
        view.secret_word = current.secret_word
        view.category = current.category_name
    if current.outcome is not None:
        results = _impostor_results(current)
        names = {p.id: p.name for p in players}
        view.guessed_word_ids = _in_player_order(
            game, [pid for pid, r in results.items() if r == scoring.ImpostorResult.CAUGHT_GUESSED]
        )
        view.outcome = current.outcome
        view.points = scoring.round_points([p.id for p in players], results)
        view.explanation = scoring.explain_round(results, names)
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
            impostor_count=game.impostor_count,
            impostors_know_each_other=game.impostors_know_each_other,
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
                impostor_ids=_in_player_order(game, r.impostor_ids),
                impostor_names=[names[pid] for pid in _in_player_order(game, r.impostor_ids)],
                suspect_ids=_in_player_order(game, r.suspect_ids),
                outcome=r.outcome,
                explanation=scoring.explain_round(_impostor_results(r), names),
            )
            for r in game.rounds
            if r.outcome is not None
        ],
    )
