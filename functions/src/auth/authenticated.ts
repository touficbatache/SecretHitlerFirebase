import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"
import * as admin from "firebase-admin"
import { DecodedIdToken, UserRecord } from "firebase-admin/lib/auth"

import { handleUnauthorizedError } from "../utils"

export async function isAuthenticatedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (process.env.DEV === "true") {
        next()
        return
    }

    const { authorization } = req.headers

    if (!authorization) {
        handleUnauthorizedError(res)
        return
    }

    if (!authorization.startsWith("Bearer")) {
        handleUnauthorizedError(res)
        return
    }

    const split: string[] = authorization.split("Bearer ")
    if (split.length !== 2) {
        handleUnauthorizedError(res)
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
        handleUnauthorizedError(res)
        return
    }
}

export async function isAuthenticated(req: Request, res: Response): Promise<boolean> {
    const { authorization } = req.headers

    if (!authorization)
        return false

    if (!authorization.startsWith("Bearer"))
        return false

    const split: string[] = authorization.split("Bearer ")
    if (split.length !== 2)
        return false

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
        return true
    } catch (err: any) {
        console.error(`${err.code} -  ${err.message}`)
        return false
    }
}
