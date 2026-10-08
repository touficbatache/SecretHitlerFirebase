import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"
import * as admin from "firebase-admin"

import { sendError } from "../errors"

export async function appCheckVerification(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  next()

  // Temporarily disable AppCheck :
  return

  const appCheckToken: string = req.header("X-Firebase-AppCheck")

  if (!appCheckToken) {
    sendError(res, "UNAUTHENTICATED")
    return
  }

  try {
    await admin.appCheck().verifyToken(appCheckToken)
    // If verifyToken() succeeds, continue with the next middleware
    // function in the stack.
    next()
  } catch {
    sendError(res, "UNAUTHENTICATED")
  }
}
