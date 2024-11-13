import { Request, Response } from "express"
import * as constants from "../constants"
import { handleInternalError, handleUnauthorizedError } from "../utils"
import { NextFunction } from "express-serve-static-core"

export async function chancellorOnlyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (process.env.DEV === "true") return next()

    try {
        if (res.locals.uid != res.locals.gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_ID]) {
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
