import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"
import * as admin from "firebase-admin"
import { DecodedIdToken, UserRecord } from "firebase-admin/lib/auth"

import { DEV_UID_HEADER, isDevMode } from "../dev-mode"
import { sendError } from "../errors"

export async function isAuthenticatedHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isDevMode()) {
    const devUid: string | undefined = req.header(DEV_UID_HEADER)
    if (devUid) res.locals = { ...res.locals, uid: devUid, name: devUid }
    next()
    return
  }

  const { authorization } = req.headers

  if (!authorization) {
    sendError(res, "UNAUTHENTICATED")
    return
  }

  if (!authorization.startsWith("Bearer")) {
    sendError(res, "UNAUTHENTICATED")
    return
  }

  const split: string[] = authorization.split("Bearer ")
  if (split.length !== 2) {
    sendError(res, "UNAUTHENTICATED")
    return
  }

  const token: string = split[1]

  try {
    const decodedToken: DecodedIdToken = await admin.auth().verifyIdToken(token)
    const userRecord: UserRecord = await admin.auth().getUser(decodedToken.uid)
    res.locals = {
      ...res.locals,
      uid: userRecord.uid,
      name: userRecord.displayName,
      phoneNumber: userRecord.phoneNumber,
    }
    next()
    return
  } catch (err: any) {
    console.error(`${err.code} -  ${err.message}`)
    sendError(res, "UNAUTHENTICATED")
    return
  }
}
