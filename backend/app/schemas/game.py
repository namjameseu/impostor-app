from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.game.game_engine import GameState
from app.game.settings import CategoryMode, ImpostorHint


class GameSettings(BaseModel):
    total_rounds: int = Field(default=5, ge=1, le=50)
    category_mode: CategoryMode = CategoryMode.RANDOM
    # Categories to mix when category_mode is 'specific'; ignored for 'random' (all categories).
    category_ids: list[int] = Field(default_factory=list, max_length=100)
    impostor_hint: ImpostorHint = ImpostorHint.CATEGORY

    @model_validator(mode="after")
    def _category_matches_mode(self) -> "GameSettings":
        self.category_ids = list(dict.fromkeys(self.category_ids))
        if self.category_mode == CategoryMode.SPECIFIC and not self.category_ids:
            raise ValueError("Choose at least one category, or use random.")
        if self.category_mode == CategoryMode.RANDOM:
            self.category_ids = []
        return self


class GameCreate(BaseModel):
    players: list[str]
    settings: GameSettings = GameSettings()


class PlayersUpdate(BaseModel):
    players: list[str]


class SuspectSelect(BaseModel):
    player_id: int


class FinalGuessResult(BaseModel):
    correct: bool


class PlayerRead(BaseModel):
    id: int
    name: str
    order_index: int
    score: int


class CategoryRef(BaseModel):
    id: int
    name: str


class SettingsRead(BaseModel):
    total_rounds: int
    category_mode: CategoryMode
    category_ids: list[int]
    categories: list[CategoryRef]
    impostor_hint: ImpostorHint


class RoundRead(BaseModel):
    """Public round info. Secret fields stay null until the state allows showing them."""

    round_number: int
    starting_player_id: int
    revealer_id: int | None = None
    next_revealer_id: int | None = None
    revealed_count: int
    suspect_id: int | None = None
    impostor_id: int | None = None
    impostor_caught: bool | None = None
    word_revealed: bool = False
    secret_word: str | None = None
    category: str | None = None
    final_guess_correct: bool | None = None
    outcome: str | None = None
    points: dict[int, int] | None = None
    explanation: str | None = None


class GameRead(BaseModel):
    id: int
    state: GameState
    total_rounds: int
    current_round_number: int
    settings: SettingsRead
    players: list[PlayerRead]
    round: RoundRead | None = None


class RoleRead(BaseModel):
    role: Literal["player", "impostor"]
    category: str | None = None
    word: str | None = None


class StandingRead(BaseModel):
    rank: int
    player_id: int
    name: str
    score: int


class RoundSummary(BaseModel):
    round_number: int
    category: str
    secret_word: str
    impostor_id: int
    impostor_name: str
    suspect_id: int | None
    outcome: str
    explanation: str


class GameResults(BaseModel):
    game_id: int
    state: GameState
    standings: list[StandingRead]
    rounds: list[RoundSummary]
