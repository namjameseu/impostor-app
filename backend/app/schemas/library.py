from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Difficulty = Literal["easy", "medium", "hard"]
CategoryName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
WordText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class CategoryCreate(BaseModel):
    name: CategoryName
    description: str | None = Field(default=None, max_length=255)
    enabled: bool = True


class CategoryUpdate(BaseModel):
    name: CategoryName | None = None
    description: str | None = Field(default=None, max_length=255)
    enabled: bool | None = None


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    enabled: bool
    word_count: int = 0
    created_at: datetime
    updated_at: datetime


class WordCreate(BaseModel):
    category_id: int
    word: WordText
    difficulty: Difficulty = "medium"
    enabled: bool = True


class WordUpdate(BaseModel):
    category_id: int | None = None
    word: WordText | None = None
    difficulty: Difficulty | None = None
    enabled: bool | None = None


class WordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    category_name: str
    word: str
    difficulty: Difficulty
    enabled: bool
    created_at: datetime
    updated_at: datetime
