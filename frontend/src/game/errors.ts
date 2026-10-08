/** Game-rule violations. Mirrors backend/app/game/errors.py so useAction's `err.message` display keeps working unchanged. */
export class GameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

/** The action is not allowed in the game's current state. */
export class InvalidStateError extends GameError {}

/** The request is well-formed but breaks a game rule (e.g. too few players). */
export class GameValidationError extends GameError {}

/** A player's private role was requested when it is not their turn. */
export class RoleAccessError extends GameError {}

export class NotFoundError extends GameError {}
