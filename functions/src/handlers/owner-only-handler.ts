import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"

import * as constants from "../constants"
import { handleInternalError, handleUnauthorizedError } from "../utils"

export async function ownerOnlyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (process.env.DEV === "true") {
    next()
    return
  }

  try {
    if (res.locals.uid != res.locals.gameData[constants.DATABASE_NODE_OWNER_ID]) {
      handleUnauthorizedError(res)
      return
    }

    return next()
  } catch (err: any) {
    handleInternalError(res, err)
    return
  }
}
