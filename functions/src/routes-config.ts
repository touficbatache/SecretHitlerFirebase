import { Application, RequestHandler } from "express"

import { appCheckVerification } from "./appcheck/app-check-verification"
import { isAuthenticatedHandler } from "./auth/authenticated"
import { getActivePublicGames, getGamesForUser } from "./game-info-controller"
import {
  act,
  advance,
  joinGame,
  legacyRoutes,
  newGame,
  setGameVisibility,
  startGame,
  unJoinGame,
} from "./gameplay-controller"
import { gameDataHandler } from "./handlers/game-data-handler"
import { ownerOnlyHandler } from "./handlers/owner-only-handler"
import { pendingTransitionHandler } from "./handlers/pending-transition-handler"
import { verifyInGameHandler } from "./handlers/verify-in-game-handler"

/**
 * Every request on a game takes the game's lock and loads it, then applies the transition whose
 * pause is over, if any (see pending-transition.ts).
 */
const onGame: RequestHandler[] = [
  appCheckVerification,
  isAuthenticatedHandler,
  gameDataHandler,
  pendingTransitionHandler,
]

export function routesConfig(app: Application): void {
  app.post("/newGame", [appCheckVerification, isAuthenticatedHandler, newGame])

  app.post("/setGameVisibility", [
    ...onGame,
    verifyInGameHandler,
    ownerOnlyHandler,
    setGameVisibility,
  ])

  app.post("/joinGame", [...onGame, joinGame])

  app.post("/unJoinGame", [...onGame, verifyInGameHandler, unJoinGame])

  app.post("/startGame", [...onGame, verifyInGameHandler, ownerOnlyHandler, startGame])

  // Every game move: the rules engine decides whose turn it is (see act)
  app.post("/action", [...onGame, verifyInGameHandler, act])

  for (const [path, handler] of Object.entries(legacyRoutes)) {
    app.post(`/${path}`, [...onGame, verifyInGameHandler, handler])
  }

  // Clients call this when a pause is over, to move the game on
  app.post("/advance", [...onGame, verifyInGameHandler, advance])

  app.post("/getGamesForSelf", [appCheckVerification, isAuthenticatedHandler, getGamesForUser])

  app.post("/getActivePublicGames", [
    appCheckVerification,
    isAuthenticatedHandler,
    getActivePublicGames,
  ])
}
