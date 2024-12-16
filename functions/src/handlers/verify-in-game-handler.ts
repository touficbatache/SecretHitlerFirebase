import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"

import * as constants from "../constants"
import { handleInternalError, handlePlayerNotInGame } from "../utils"

export async function verifyInGameHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (process.env.DEV === "true") return next()

  try {
    if (
      !res.locals.gameData[constants.DATABASE_NODE_PLAYERS]
        .map((player: any) => player.id)
        .includes(res.locals.uid)
    ) {
      handlePlayerNotInGame(res)
      return
    }

    next()
    return
  } catch (err: any) {
    handleInternalError(res, err)
    return
  }
}
