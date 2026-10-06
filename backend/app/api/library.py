from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.library import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    Difficulty,
    WordCreate,
    WordRead,
    WordUpdate,
)
from app.services import library_service

router = APIRouter(tags=["library"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(db: DB, include_disabled: bool = True):
    return library_service.list_categories(db, include_disabled)


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, db: DB):
    return library_service.create_category(db, data)


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(category_id: int, data: CategoryUpdate, db: DB):
    return library_service.update_category(db, category_id, data)


@router.get("/words", response_model=list[WordRead])
def list_words(
    db: DB,
    category_id: int | None = None,
    difficulty: Difficulty | None = None,
    search: Annotated[str | None, Query(max_length=80)] = None,
    include_disabled: bool = True,
):
    return library_service.list_words(
        db,
        category_id=category_id,
        difficulty=difficulty,
        search=search,
        include_disabled=include_disabled,
    )


@router.post("/words", response_model=WordRead, status_code=status.HTTP_201_CREATED)
def create_word(data: WordCreate, db: DB):
    return library_service.create_word(db, data)


@router.patch("/words/{word_id}", response_model=WordRead)
def update_word(word_id: int, data: WordUpdate, db: DB):
    return library_service.update_word(db, word_id, data)


@router.delete("/words/{word_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_word(word_id: int, db: DB):
    library_service.delete_word(db, word_id)
