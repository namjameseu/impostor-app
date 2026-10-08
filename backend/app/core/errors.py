class AppError(Exception):
    """Base class for request-level errors. Mapped to HTTP errors in app.main."""


class NotFoundError(AppError):
    pass


class ConflictError(AppError):
    pass
