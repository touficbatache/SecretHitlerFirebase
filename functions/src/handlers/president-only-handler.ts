import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"

import * as constants from "../constants"
import { isDevMode } from "../dev-mode"
import { handleInternalError, handleUnauthorizedError } from "../utils"

export async function presidentOnlyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isDevMode()) return next()

  try {
    if (
      res.locals.uid !=
      res.locals.gameData[constants.DATABASE_NODE_CURRENT_SESSION][
        constants.DATABASE_NODE_PRESIDENT_ID
      ]
    ) {
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
