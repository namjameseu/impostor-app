from enum import StrEnum


class CategoryMode(StrEnum):
    RANDOM = "random"
    SPECIFIC = "specific"


class ImpostorHint(StrEnum):
    NONE = "none"
    CATEGORY = "category"


class ImpostorMode(StrEnum):
    CLASSIC = "classic"  # Impostors get no word (optionally the category) and know their role
    SIMILAR_WORD = "similar_word"  # Impostors get a related word and aren't told they're Impostors
