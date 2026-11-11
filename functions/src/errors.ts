import { Response } from "express"

import { RuleError, RuleErrorCode } from "./engine"

/**
 * Every error response is `{ error: { code, message } }`. Clients act on `code`; `message` is for
 * people reading logs. The HTTP status is the standard one for the kind of error.
 */
export type ErrorCode =
  /** Not logged in, or the login or App Check token is invalid. */
  | "UNAUTHENTICATED"
  /** The request body is missing a field or has one of the wrong type. */
  | "INVALID_REQUEST"
  | "GAME_NOT_FOUND"
  /** The player isn't in this game. */
  | "NOT_IN_GAME"
  /** Only the game's owner can do that. */
  | "NOT_OWNER"
  /** Another player has to act now. */
  | "NOT_YOUR_TURN"
  /** The game has moved on: the action was meant for an earlier phase. */
  | "WRONG_PHASE"
  /** A result is showing: actions resume when the pause is over. */
  | "PAUSED"
  /** Another request on this game took too long. Retrying is safe. */
  | "GAME_BUSY"
  /** The chosen player can't be chosen: dead, term-limited, investigated before... */
  | "INELIGIBLE"
  /** The action can't be done: a policy that isn't in hand, a missing target... */
  | "INVALID_ACTION"
  | "ALREADY_IN_GAME"
  | "GAME_FULL"
  | "GAME_STARTED"
  | "NOT_ENOUGH_PLAYERS"
  | "INTERNAL"

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  INVALID_REQUEST: 400,
  GAME_NOT_FOUND: 404,
  NOT_IN_GAME: 403,
  NOT_OWNER: 403,
  NOT_YOUR_TURN: 403,
  WRONG_PHASE: 409,
  PAUSED: 409,
  GAME_BUSY: 409,
  INELIGIBLE: 422,
  INVALID_ACTION: 422,
  ALREADY_IN_GAME: 409,
  GAME_FULL: 409,
  GAME_STARTED: 409,
  NOT_ENOUGH_PLAYERS: 422,
  INTERNAL: 500,
}

const MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Not logged in",
  INVALID_REQUEST: "Missing or invalid fields",
  GAME_NOT_FOUND: "Game not found",
  NOT_IN_GAME: "Player not in this game",
  NOT_OWNER: "Only the game's owner can do this",
  NOT_YOUR_TURN: "It's not this player's turn",
  WRONG_PHASE: "The game has moved on",
  PAUSED: "Wait for the end of the pause",
  GAME_BUSY: "The game is busy, try again",
  INELIGIBLE: "This player can't be chosen",
  INVALID_ACTION: "This action isn't possible",
  ALREADY_IN_GAME: "Player already in this game",
  GAME_FULL: "The game is full",
  GAME_STARTED: "The game has already started",
  NOT_ENOUGH_PLAYERS: "Not enough players",
  INTERNAL: "Something went wrong",
}

export function sendError(res: Response, code: ErrorCode, message: string = MESSAGES[code]): void {
  res.status(STATUS[code]).send({ error: { code, message } })
}

/** Logs the error and sends a generic one: internal details never reach the client. */
export function sendInternalError(res: Response, err: unknown): void {
  console.error(err)
  sendError(res, "INTERNAL")
}

const RULE_ERRORS: Record<RuleErrorCode, ErrorCode> = {
  wrongPhase: "WRONG_PHASE",
  notYourTurn: "NOT_YOUR_TURN",
  ineligible: "INELIGIBLE",
  invalidAction: "INVALID_ACTION",
}

/** A rules engine error, with the engine's own message. */
export function sendRuleError(res: Response, error: RuleError): void {
  sendError(res, RULE_ERRORS[error.code], error.message)
}
