from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.game import (
    FinalGuessResult,
    GameCreate,
    GameRead,
    GameResults,
    PlayerAdd,
    PlayersUpdate,
    RoleRead,
    SuspectSelect,
)
from app.services import game_service as svc

router = APIRouter(prefix="/games", tags=["games"])
DB = Annotated[Session, Depends(get_db)]
CURRENT = "/{game_id}/rounds/current"


@router.post("", response_model=GameRead, status_code=status.HTTP_201_CREATED)
def create_game(data: GameCreate, db: DB):
    return svc.to_game_read(svc.create_game(db, data.players, data.settings))


@router.get("/{game_id}", response_model=GameRead)
def get_game(game_id: int, db: DB):
    return svc.to_game_read(svc.get_game(db, game_id))


@router.put("/{game_id}/players", response_model=GameRead)
def replace_players(game_id: int, data: PlayersUpdate, db: DB):
    return svc.to_game_read(svc.replace_players(db, game_id, data.players))


@router.post("/{game_id}/players", response_model=GameRead, status_code=status.HTTP_201_CREATED)
def add_player(game_id: int, data: PlayerAdd, db: DB):
    """Add a late arrival (setup or between rounds)."""
    return svc.to_game_read(svc.add_player(db, game_id, data.name))


@router.delete("/{game_id}/players/{player_id}", response_model=GameRead)
def remove_player(game_id: int, player_id: int, db: DB):
    """A player leaves (setup or between rounds); their history is kept."""
    return svc.to_game_read(svc.remove_player(db, game_id, player_id))


@router.post("/{game_id}/start", response_model=GameRead)
def start_game(game_id: int, db: DB):
    return svc.to_game_read(svc.start_game(db, game_id))


@router.get(
    CURRENT + "/players/{player_id}/role", response_model=RoleRead, response_model_exclude_none=True
)
def get_player_role(game_id: int, player_id: int, db: DB):
    return svc.get_player_role(db, game_id, player_id).as_dict()


@router.post(CURRENT + "/players/{player_id}/reveal-complete", response_model=GameRead)
def complete_reveal(game_id: int, player_id: int, db: DB):
    return svc.to_game_read(svc.complete_reveal(db, game_id, player_id))


@router.post(CURRENT + "/start-clues", response_model=GameRead)
def start_clue_round(game_id: int, db: DB):
    return svc.to_game_read(svc.start_clue_round(db, game_id))


@router.post(CURRENT + "/start-voting", response_model=GameRead)
def start_voting(game_id: int, db: DB):
    return svc.to_game_read(svc.start_voting(db, game_id))


@router.put(CURRENT + "/suspects", response_model=GameRead)
def select_suspects(game_id: int, data: SuspectSelect, db: DB):
    return svc.to_game_read(svc.select_suspects(db, game_id, data.player_ids))


@router.post(CURRENT + "/reveal-impostors", response_model=GameRead)
def reveal_impostors(game_id: int, db: DB):
    return svc.to_game_read(svc.reveal_impostors(db, game_id))


@router.post(CURRENT + "/reveal-word", response_model=GameRead)
def reveal_word(game_id: int, db: DB):
    return svc.to_game_read(svc.reveal_word(db, game_id))


@router.post(CURRENT + "/final-guess", response_model=GameRead)
def record_final_guess(game_id: int, data: FinalGuessResult, db: DB):
    return svc.to_game_read(svc.record_final_guess(db, game_id, data.correct_player_ids))


@router.post("/{game_id}/rounds", response_model=GameRead, status_code=status.HTTP_201_CREATED)
def next_round(game_id: int, db: DB):
    return svc.to_game_read(svc.next_round(db, game_id))


@router.post("/{game_id}/finish", response_model=GameRead)
def finish_game(game_id: int, db: DB):
    return svc.to_game_read(svc.finish_game(db, game_id))


@router.get("/{game_id}/results", response_model=GameResults)
def get_results(game_id: int, db: DB):
    return svc.get_results(db, game_id)


@router.post("/{game_id}/play-again", response_model=GameRead, status_code=status.HTTP_201_CREATED)
def play_again(game_id: int, db: DB):
    return svc.to_game_read(svc.play_again(db, game_id))
