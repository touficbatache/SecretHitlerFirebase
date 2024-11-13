import { Request, Response } from "express"
import * as admin from "firebase-admin"
import * as constants from "../constants"
import { handleGameNotFound, handleInternalError, handleMissingFields } from "../utils"
import { NextFunction } from "express-serve-static-core"

export async function gameDataHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { code } = req.body
        if (!(typeof code === "string") || !code) {
            handleMissingFields(res)
            return
        }
        const data: any = await getGameData(code)
        if (data == null) {
            handleGameNotFound(res)
            return
        }
        res.locals = { ...res.locals, gameCode: code, gameData: data }
        next()
        return
    } catch (err: any) {
        handleInternalError(res, err)
        return
    }
}

export async function getGameData(gameCode: string) {
    const data: any = (await admin.database().ref().child(constants.DATABASE_NODE_ONGOING_GAMES).child(gameCode).get()).val()
    if (data == null) {
        return
    }
    data[constants.DATABASE_NODE_PLAYERS] = Object.values(data[constants.DATABASE_NODE_PLAYERS])
    if (data[constants.DATABASE_NODE_SESSIONS] != null) {
        data[constants.DATABASE_NODE_SESSIONS] = Object.values(data[constants.DATABASE_NODE_SESSIONS])
    }
    if (data[constants.DATABASE_NODE_CURRENT_SESSION] != null
        && data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_POLICIES] != null) {
        data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_POLICIES] = _stringToStringList(data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_POLICIES].toString())
    }
    if (data[constants.DATABASE_NODE_CURRENT_SESSION] != null
        && data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_POLICIES] != null) {
        data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_POLICIES] = _stringToStringList(data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_POLICIES].toString())
    }
    if (data[constants.DATABASE_NODE_CHAMBER_POLICIES] != null
        && data[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE] != null) {
        data[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE] = _stringToStringList(data[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE].toString())
    }
    return data
}

function _stringToStringList(str: string) {
    return str.split(",")
}

function _stringListToString(strList: string[]) {
    return strList.join(",")
}

export class GameDataUpdates {
    private readonly _updates: any = {}

    constructor(update?: any) {
        if (update !== undefined) this.push(update)
    }

    get updates() {
        return this._updates
    }

    public push(update: any) {
        Object.assign(this._updates, this.safeData(update))
    }

    private safeData(updateData: any, parentKey?: string): any {
        const safeUpdateData: any = {}

        for (const key in updateData) {
            if (Object.prototype.hasOwnProperty.call(updateData, key)) {
                const value: any = updateData[key]
                const newKey: string = parentKey ? `${parentKey}/${key}` : key

                if (typeof value === "object"
                    && value !== null
                    && !Object.prototype.hasOwnProperty.call(value, ".sv")
                    && !/^.*\.override$/.test(key)
                    && !Array.isArray(value)
                ) {
                    const nestedData: any = this.safeData(value, newKey)
                    Object.assign(safeUpdateData, nestedData)
                } else {
                    let formattedValue: any = value

                    if (Array.isArray(value) && value.length > 0 && value.every((val: any) => typeof val === "string")) {
                        formattedValue = _stringListToString(value)
                    }

                    if (/^.*\.override$/.test(key)) {
                        const strippedKey: string = newKey.split(".override")[0]
                        safeUpdateData[strippedKey] = Object.assign(this._updates[strippedKey] ?? {}, formattedValue)
                    } else {
                        safeUpdateData[newKey] = formattedValue
                    }
                }
            }
        }

        return safeUpdateData
    }
}
