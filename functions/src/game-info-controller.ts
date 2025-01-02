import { DataSnapshot, IteratedDataSnapshot } from "@firebase/database-types"
import { Request, Response } from "express"
import * as admin from "firebase-admin"

import * as constants from "./constants"
import { ChamberStatus, ChamberSubStatus, GameVisibility } from "./objects"
import { handleInternalError, handleSuccess } from "./utils"

interface GameInfo {
  code: string
  createdAt: number
  playerCount: number
  startedAt: number
  visibility: GameVisibility
  status: ChamberStatus
  subStatus: ChamberSubStatus
}

export async function getGamesForUser(req: Request, res: Response): Promise<void> {
  try {
    const userId: string =
      process.env.DEV === "true"
        ? `randId${res.locals.gameData[constants.DATABASE_NODE_PLAYERS].length}`
        : res.locals.uid

    const gamesSnapshot: DataSnapshot = await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .get()

    const gamesWithPlayer: GameInfo[] = []

    gamesSnapshot.forEach((gameSnapshot: IteratedDataSnapshot) => {
      const gameData: any = gameSnapshot.val()
      if (gameData.connected && Object.keys(gameData.connected).includes(userId)) {
        const playerCount: number = Object.keys(gameData.connected).length
        gamesWithPlayer.push({
          code: gameSnapshot.key,
          createdAt: gameData.createdAt,
          playerCount,
          startedAt: gameData.startedAt,
          visibility: gameData[constants.DATABASE_NODE_VISIBILITY],
          status: gameData[constants.DATABASE_NODE_STATUS],
          subStatus: gameData[constants.DATABASE_NODE_SUB_STATUS],
        })
      }
    })

    gamesWithPlayer.sort((a: GameInfo, b: GameInfo) => b.createdAt - a.createdAt)

    handleSuccess(res, gamesWithPlayer)
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

export async function getActivePublicGames(req: Request, res: Response): Promise<void> {
  try {
    const gamesSnapshot: DataSnapshot = await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .get()

    const activePublicGames: GameInfo[] = []

    gamesSnapshot.forEach((gameSnapshot: IteratedDataSnapshot) => {
      const gameData: any = gameSnapshot.val()
      if (
        gameData[constants.DATABASE_NODE_VISIBILITY] === GameVisibility.PUBLIC &&
        gameData.connected !== undefined &&
        Object.values(gameData.connected).some((status: boolean) => status === true) &&
        gameData[constants.DATABASE_NODE_STATUS] !== ChamberStatus[ChamberStatus.gameEnded]
      ) {
        const playerCount: number = Object.keys(gameData.connected).length
        activePublicGames.push({
          code: gameSnapshot.key,
          createdAt: gameData.createdAt,
          playerCount,
          startedAt: gameData.startedAt,
          visibility: gameData[constants.DATABASE_NODE_VISIBILITY],
          status: gameData[constants.DATABASE_NODE_STATUS],
          subStatus: gameData[constants.DATABASE_NODE_SUB_STATUS],
        })
      }
    })

    activePublicGames.sort((a: GameInfo, b: GameInfo) => b.createdAt - a.createdAt)

    handleSuccess(res, activePublicGames)
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}
