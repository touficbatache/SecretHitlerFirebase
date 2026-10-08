import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"
import * as admin from "firebase-admin"

import * as constants from "../constants"
import {
  handleGameBusyError,
  handleGameNotFound,
  handleInternalError,
  handleMissingFields,
} from "../utils"

import { acquireGameLock, GameLockContext, releaseGameLock } from "./game-lock"

/**
 * Loads the game for the rest of the request, after taking the game's lock.
 *
 * Requests on the same game run one at a time: a request holds the lock until its
 * response is sent, which (since every request finishes its work before responding)
 * covers all of its reads and writes. A concurrent request waits, then reads the
 * updated game. This prevents double votes, double taps, joins past 10 players and
 * any other read-then-write race.
 *
 * Requests never wait out the pauses between phases (see pending-transition.ts), so the
 * lock is only held for a few quick reads and writes.
 */
export async function gameDataHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { code } = req.body
    if (!(typeof code === "string") || !code) {
      handleMissingFields(res)
      return
    }

    const lockToken: string | undefined = await acquireGameLock(code)
    if (lockToken === undefined) {
      handleGameBusyError(res)
      return
    }
    const lock: GameLockContext = { gameCode: code, token: lockToken }
    releaseLockBeforeResponding(res, lock)

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

/**
 * Delays the end of the response until the lock is released. Releasing after the
 * response would run with no guaranteed CPU, and could leave the game locked until
 * the lock expires. This also covers every way a request ends: success, an error
 * response from any middleware, or a client that disconnected mid-request.
 */
function releaseLockBeforeResponding(res: Response, lock: GameLockContext): void {
  const end: Response["end"] = res.end.bind(res)

  res.end = ((...args: any[]) => {
    const token: string | undefined = lock.token
    if (token === undefined) {
      return (end as any)(...args)
    }
    lock.token = undefined
    releaseGameLock(lock.gameCode, token)
      .catch((err: any) => console.error(`Failed to release lock for game ${lock.gameCode}`, err))
      .finally(() => (end as any)(...args))
    return res
  }) as Response["end"]
}

export async function getInactiveGameCodes(): Promise<string[]> {
  console.log("getInactiveGameCodes")
  const dataSnapshot: any = await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .get()
  const inactiveGameCodes: string[] = []
  if (dataSnapshot.exists()) {
    console.log("dataSnapshot exists")
    dataSnapshot.forEach((snapshot: any) => {
      if (snapshot.val().connected !== undefined) {
        console.log(
          "in for each with snapshot",
          "snapshot.val().connected",
          snapshot.val().connected,
          snapshot.key,
        )
        if (Object.values(snapshot.val().connected).every((status: boolean) => status === false)) {
          console.log(
            "Object.values(snapshot.val().connected)",
            Object.values(snapshot.val().connected),
          )
          inactiveGameCodes.push(snapshot.key)
          console.log("snapshot.key", snapshot.key)
        }
      }
    })
  }
  return inactiveGameCodes
}

export async function getGameData(gameCode: string) {
  const data: any = (
    await admin.database().ref().child(constants.DATABASE_NODE_ONGOING_GAMES).child(gameCode).get()
  ).val()
  if (data == null) {
    return
  }
  return decodeGameData(data)
}

/**
 * A game as stored, in the shape the code works with: players and sessions as arrays, and policy
 * lists split from their comma-separated strings. Changes `data` in place.
 */
export function decodeGameData(data: any) {
  // A lobby being closed has no players left (see unJoinGame)
  data[constants.DATABASE_NODE_PLAYERS] = Object.values(data[constants.DATABASE_NODE_PLAYERS] ?? {})
  if (data[constants.DATABASE_NODE_SESSIONS] != null) {
    data[constants.DATABASE_NODE_SESSIONS] = Object.values(data[constants.DATABASE_NODE_SESSIONS])
  }
  if (
    data[constants.DATABASE_NODE_CURRENT_SESSION] != null &&
    data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_POLICIES] !=
      null
  ) {
    data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_POLICIES] =
      _stringToStringList(
        data[constants.DATABASE_NODE_CURRENT_SESSION][
          constants.DATABASE_NODE_PRESIDENT_POLICIES
        ].toString(),
      )
  }
  if (
    data[constants.DATABASE_NODE_CURRENT_SESSION] != null &&
    data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_POLICIES] !=
      null
  ) {
    data[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_POLICIES] =
      _stringToStringList(
        data[constants.DATABASE_NODE_CURRENT_SESSION][
          constants.DATABASE_NODE_CHANCELLOR_POLICIES
        ].toString(),
      )
  }
  if (
    data[constants.DATABASE_NODE_CHAMBER_POLICIES] != null &&
    data[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE] != null
  ) {
    data[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE] =
      _stringToStringList(
        data[constants.DATABASE_NODE_CHAMBER_POLICIES][
          constants.DATABASE_NODE_DRAW_PILE
        ].toString(),
      )
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

        if (
          typeof value === "object" &&
          value !== null &&
          !Object.prototype.hasOwnProperty.call(value, ".sv") &&
          !/^.*\.override$/.test(key) &&
          !Array.isArray(value)
        ) {
          const nestedData: any = this.safeData(value, newKey)
          Object.assign(safeUpdateData, nestedData)
        } else {
          let formattedValue: any = value

          if (
            Array.isArray(value) &&
            value.length > 0 &&
            value.every((val: any) => typeof val === "string")
          ) {
            formattedValue = _stringListToString(value)
          }

          if (/^.*\.override$/.test(key)) {
            const strippedKey: string = newKey.split(".override")[0]
            safeUpdateData[strippedKey] = Object.assign(
              this._updates[strippedKey] ?? {},
              formattedValue,
            )
          } else {
            safeUpdateData[newKey] = formattedValue
          }
        }
      }
    }

    return safeUpdateData
  }
}
