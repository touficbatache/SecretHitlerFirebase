import { DataSnapshot, IteratedDataSnapshot } from "@firebase/database-types"
import { Request, Response } from "express"
import * as admin from "firebase-admin"

import * as constants from "./constants"
import { ChamberStatus } from "./objects"
import { handleInternalError, handleSuccess } from "./utils"

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

    interface GameWithPlayer {
      code: string
      createdAt: number
      playerCount: number
      startedAt: number
      status: ChamberStatus
      // TODO: type ChamberSubStatus
      subStatus: string
    }

    const gamesWithPlayer: GameWithPlayer[] = []

    gamesSnapshot.forEach((gameSnapshot: IteratedDataSnapshot) => {
      const gameData: any = gameSnapshot.val()
      if (gameData.connected && gameData.connected[userId]) {
        const playerCount: number = Object.keys(gameData.connected).length
        gamesWithPlayer.push({
          code: gameSnapshot.key,
          createdAt: gameData.createdAt,
          playerCount,
          startedAt: gameData.startedAt,
          status: gameData[constants.DATABASE_NODE_STATUS],
          subStatus: gameData[constants.DATABASE_NODE_SUB_STATUS],
        })
      }
    })

    gamesWithPlayer.sort((a: GameWithPlayer, b: GameWithPlayer) => b.createdAt - a.createdAt)

    handleSuccess(res, gamesWithPlayer)
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}
