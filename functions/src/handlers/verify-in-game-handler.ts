import { Request, Response } from "express"
import * as constants from "../constants"
import { handleInternalError, handlePlayerNotInGame } from "../utils"
import { NextFunction } from "express-serve-static-core"

export async function verifyInGameHandler(req: Request, res: Response, next: NextFunction) {
    if (process.env.DEV) return next()

    try {
        if (!res.locals.gameData[constants.DATABASE_NODE_PLAYERS].map((player: any) => player.id).includes(res.locals.uid)) {
            return handlePlayerNotInGame(res)
        }

        return next()
    } catch (err: any) {
        return handleInternalError(res, err)
    }
}