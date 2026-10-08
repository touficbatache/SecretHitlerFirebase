import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"

import * as constants from "../constants"
import { runDueTransitions } from "../gameplay-controller"
import { handleGameProgressTamperingError, handleInternalError } from "../utils"

import { getGameData } from "./game-data-handler"

/**
 * Runs after gameDataHandler, holding the game's lock: applies the game's pending transition
 * if its pause is over, so the request sees the game as it is now.
 *
 * With `rejectWhilePending`, a request sent during a pause (the intro, the votes being shown...)
 * is rejected: it was made for a phase that is ending.
 */
export function pendingTransitionHandler(options: { rejectWhilePending: boolean }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const gameCode: string = res.locals.gameCode
      if (await runDueTransitions(gameCode, res.locals.gameData)) {
        res.locals.gameData = await getGameData(gameCode)
      }

      if (
        options.rejectWhilePending &&
        res.locals.gameData?.[constants.DATABASE_NODE_PENDING_TRANSITION] != null
      ) {
        handleGameProgressTamperingError(res)
        return
      }

      next()
      return
    } catch (err: any) {
      handleInternalError(res, err)
      return
    }
  }
}
