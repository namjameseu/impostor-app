from pydantic import BaseModel


class PlayerStats(BaseModel):
    name: str
    games: int
    wins: int
    rounds: int
    points: int
    impostor_rounds: int
    escaped: int
    caught: int
    guessed_word: int


class StatsRead(BaseModel):
    games: int
    finished_games: int
    players: list[PlayerStats]
