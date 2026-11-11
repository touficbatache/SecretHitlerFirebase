import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"

import { sendInternalError } from "../errors"
import { runDueTransitions } from "../gameplay-controller"

import { getGameData } from "./game-data-handler"

/**
 * Runs after gameDataHandler, holding the game's lock: applies the game's pending transition
 * if its pause is over, so the request sees the game as it is now.
 */
export async function pendingTransitionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    if (await runDueTransitions(gameCode, res.locals.gameData)) {
      res.locals.gameData = await getGameData(gameCode)
    }
    next()
    return
  } catch (err: any) {
    sendInternalError(res, err)
    return
  }
}
