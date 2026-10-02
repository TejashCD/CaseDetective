// Game errors. Messages are shown to the player as-is.

export class GameError extends Error {
  override name = "GameError";
}

export class InvalidInputError extends GameError {
  override name = "InvalidInputError";
}

export class InputTooLargeError extends GameError {
  override name = "InputTooLargeError";
}

/** E.g. accusing before all clues are earned. */
export class ActionNotAllowedError extends GameError {
  override name = "ActionNotAllowedError";
}

export class CaseNotFoundError extends GameError {
  override name = "CaseNotFoundError";

  constructor() {
    super("This case file is gone. The server may have restarted. Start a new case.");
  }
}
