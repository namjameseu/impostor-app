from enum import StrEnum


class CategoryMode(StrEnum):
    RANDOM = "random"
    SPECIFIC = "specific"


class ImpostorHint(StrEnum):
    NONE = "none"
    CATEGORY = "category"
