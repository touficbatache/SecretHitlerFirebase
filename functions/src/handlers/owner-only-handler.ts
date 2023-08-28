import { Request, Response } from "express"
import * as constants from "../constants"
import { handleInternalError, handleUnauthorizedError } from "../utils"
import { NextFunction } from "express-serve-static-core"

export async function ownerOnlyHandler(req: Request, res: Response, next: NextFunction) {
    if (process.env.DEV === "true") return next()

    try {
        if (res.locals.uid != res.locals.gameData[constants.DATABASE_NODE_OWNER_ID]) {
            return handleUnauthorizedError(res)
        }

        return next()
    } catch (err: any) {
        return handleInternalError(res, err)
    }
}