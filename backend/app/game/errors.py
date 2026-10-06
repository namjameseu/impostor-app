class GameError(Exception):
    """Base class for game-rule violations. Mapped to HTTP errors in app.main."""


class InvalidStateError(GameError):
    """The action is not allowed in the game's current state."""


class GameValidationError(GameError):
    """The request is well-formed but breaks a game rule (e.g. too few players)."""


class RoleAccessError(GameError):
    """A player's private role was requested when it is not their turn."""


class NotFoundError(GameError):
    pass


class ConflictError(GameError):
    pass
