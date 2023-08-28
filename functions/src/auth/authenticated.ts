import { Request, Response } from "express"
import * as admin from "firebase-admin"
import { handleUnauthorizedError } from "../utils"
import { DecodedIdToken } from "firebase-admin/lib/auth"
import { NextFunction } from "express-serve-static-core"

export async function isAuthenticatedHandler(req: Request, res: Response, next: NextFunction) {
    if (process.env.DEV === "true") return next()

    const { authorization } = req.headers

    if (!authorization)
        return handleUnauthorizedError(res)

    if (!authorization.startsWith("Bearer"))
        return handleUnauthorizedError(res)

    const split: string[] = authorization.split("Bearer ")
    if (split.length !== 2)
        return handleUnauthorizedError(res)

    const token: string = split[1]

    try {
        const decodedToken: DecodedIdToken = await admin.auth().verifyIdToken(token)
        res.locals = {
            ...res.locals,
            uid: decodedToken.uid,
            name: decodedToken.name,
            role: decodedToken.role,
            phone_number: decodedToken.phone_number,
            email: decodedToken.email,
        }
        return next()
    } catch (err: any) {
        console.error(`${err.code} -  ${err.message}`)
        return handleUnauthorizedError(res)
    }
}

export async function isAuthenticated(req: Request, res: Response) {
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
        res.locals = {
            ...res.locals,
            uid: decodedToken.uid,
            role: decodedToken.role,
            phone_number: decodedToken.phone_number,
            email: decodedToken.email,
        }
        return true
    } catch (err: any) {
        console.error(`${err.code} -  ${err.message}`)
        return false
    }
}
