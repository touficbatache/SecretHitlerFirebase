import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"

import * as constants from "../constants"
import { isSimulated } from "../dev-mode"
import { sendError, sendInternalError } from "../errors"

export async function verifyInGameHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isSimulated(res)) return next()

  try {
    if (
      !res.locals.gameData[constants.DATABASE_NODE_PLAYERS]
        .map((player: any) => player.id)
        .includes(res.locals.uid)
    ) {
      sendError(res, "NOT_IN_GAME")
      return
    }

    next()
    return
  } catch (err: any) {
    sendInternalError(res, err)
    return
  }
}
