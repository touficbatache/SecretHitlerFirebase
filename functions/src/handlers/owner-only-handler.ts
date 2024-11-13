import { Request, Response } from "express"
import * as constants from "../constants"
import { handleInternalError, handleUnauthorizedError } from "../utils"
import { NextFunction } from "express-serve-static-core"

export async function ownerOnlyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
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
