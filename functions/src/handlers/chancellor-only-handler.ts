import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"

import * as constants from "../constants"
import { isDevMode } from "../dev-mode"
import {
  handleGameProgressTamperingError,
  handleInternalError,
  handleUnauthorizedError,
} from "../utils"

export async function chancellorOnlyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isDevMode()) return next()

  try {
    const currentSession: any = res.locals.gameData[constants.DATABASE_NODE_CURRENT_SESSION]

    // No current session: the game hasn't started its first election yet, or it has ended.
    if (currentSession == null) {
      handleGameProgressTamperingError(res)
      return
    }

    if (res.locals.uid != currentSession[constants.DATABASE_NODE_CHANCELLOR_ID]) {
      handleUnauthorizedError(res)
      return
    }

    next()
    return
  } catch (err: any) {
    handleInternalError(res, err)
    return
  }
}
