import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"

import * as constants from "../constants"
import { isSimulated } from "../dev-mode"
import { sendError, sendInternalError } from "../errors"

export async function ownerOnlyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isSimulated(res)) {
    next()
    return
  }

  try {
    if (res.locals.uid != res.locals.gameData[constants.DATABASE_NODE_OWNER_ID]) {
      sendError(res, "NOT_OWNER")
      return
    }

    return next()
  } catch (err: any) {
    sendInternalError(res, err)
    return
  }
}
