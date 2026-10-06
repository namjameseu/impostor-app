from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.game.game_engine import GameState
from app.game.settings import CategoryMode, ImpostorHint, ImpostorMode


class GameSettings(BaseModel):
    total_rounds: int = Field(default=5, ge=1, le=50)
    category_mode: CategoryMode = CategoryMode.RANDOM
    # Categories to mix when category_mode is 'specific'; ignored for 'random' (all categories).
    category_ids: list[int] = Field(default_factory=list, max_length=100)
    impostor_hint: ImpostorHint = ImpostorHint.CATEGORY
    # Upper limit depends on the number of players; checked when the game is created.
    impostor_count: int = Field(default=1, ge=1, le=9)
    impostors_know_each_other: bool = False
    impostor_mode: ImpostorMode = ImpostorMode.CLASSIC

    @model_validator(mode="after")
    def _category_matches_mode(self) -> "GameSettings":
        self.category_ids = list(dict.fromkeys(self.category_ids))
        if self.category_mode == CategoryMode.SPECIFIC and not self.category_ids:
            raise ValueError("Choose at least one category, or use random.")
        if self.category_mode == CategoryMode.RANDOM:
            self.category_ids = []
        if self.impostor_mode == ImpostorMode.SIMILAR_WORD:
            # Impostors don't know they're Impostors, so they can't know each other either.
            self.impostors_know_each_other = False
        return self


class GameCreate(BaseModel):
    players: list[str]
    settings: GameSettings = GameSettings()


class PlayersUpdate(BaseModel):
    players: list[str]


class PlayerAdd(BaseModel):
    name: str


class SuspectSelect(BaseModel):
    """The group's accused players; exactly one per Impostor."""

    player_ids: list[int] = Field(min_length=1)


class FinalGuessResult(BaseModel):
    """Caught Impostors whose spoken guess was right; every other caught Impostor missed."""

    correct_player_ids: list[int] = []


class PlayerRead(BaseModel):
    id: int
    name: str
    order_index: int
    score: int
    active: bool = True


class CategoryRef(BaseModel):
    id: int
    name: str


class SettingsRead(BaseModel):
    total_rounds: int
    category_mode: CategoryMode
    category_ids: list[int]
    categories: list[CategoryRef]
    impostor_hint: ImpostorHint
    impostor_count: int
    impostors_know_each_other: bool
    impostor_mode: ImpostorMode


class RoundRead(BaseModel):
    """Public round info. Secret fields stay null until the state allows showing them."""

    round_number: int
    starting_player_id: int
    revealer_id: int | None = None
    next_revealer_id: int | None = None
    revealed_count: int
    suspect_ids: list[int] = []
    impostor_ids: list[int] | None = None
    caught_impostor_ids: list[int] | None = None
    word_revealed: bool = False
    secret_word: str | None = None
    # Similar Word mode: the Impostors' related word, shown alongside the secret word.
    impostor_word: str | None = None
    category: str | None = None
    guessed_word_ids: list[int] | None = None
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
    # Other Impostors' names; only for Impostors, only when the game allows it.
    fellow_impostors: list[str] | None = None


class StandingRead(BaseModel):
    rank: int
    player_id: int
    name: str
    score: int


class RoundSummary(BaseModel):
    round_number: int
    category: str
    secret_word: str
    impostor_word: str | None = None
    impostor_ids: list[int]
    impostor_names: list[str]
    suspect_ids: list[int]
    outcome: str
    explanation: str


class GameResults(BaseModel):
    game_id: int
    state: GameState
    standings: list[StandingRead]
    rounds: list[RoundSummary]
