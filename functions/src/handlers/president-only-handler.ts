import { Request, Response } from "express"
import * as constants from "../constants"
import { handleInternalError, handleUnauthorizedError } from "../utils"
import { NextFunction } from "express-serve-static-core"

export async function presidentOnlyHandler(req: Request, res: Response, next: NextFunction) {
    if (process.env.DEV) return next()

    try {
        if (res.locals.uid != res.locals.gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID]) {
            return handleUnauthorizedError(res)
        }

        return next()
    } catch (err: any) {
        return handleInternalError(res, err)
    }
}