import { Application, RequestHandler } from "express"

import { appCheckVerification } from "./appcheck/app-check-verification"
import { isAuthenticatedHandler } from "./auth/authenticated"
import { getActivePublicGames, getGamesForUser } from "./game-info-controller"
import {
  advance,
  answerVeto,
  askForVeto,
  chancellorDiscardPolicy,
  chooseChancellor,
  joinGame,
  newGame,
  presidentDiscardPolicy,
  presidentialPower,
  setGameVisibility,
  startGame,
  unJoinGame,
  vote,
} from "./gameplay-controller"
import { chancellorOnlyHandler } from "./handlers/chancellor-only-handler"
import { gameDataHandler } from "./handlers/game-data-handler"
import { ownerOnlyHandler } from "./handlers/owner-only-handler"
import { pendingTransitionHandler } from "./handlers/pending-transition-handler"
import { presidentOnlyHandler } from "./handlers/president-only-handler"
import { verifyInGameHandler } from "./handlers/verify-in-game-handler"

// Every request on a game first applies the transitions that are due (see pending-transition.ts).
// Gameplay actions sent during a pause are rejected; lobby and settings requests aren't.
const applyDueTransitions: RequestHandler = pendingTransitionHandler({ rejectWhilePending: false })
const rejectDuringPause: RequestHandler = pendingTransitionHandler({ rejectWhilePending: true })

export function routesConfig(app: Application): void {
  app.post("/newGame", [appCheckVerification, isAuthenticatedHandler, newGame])

  app.post("/setGameVisibility", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    applyDueTransitions,
    verifyInGameHandler,
    ownerOnlyHandler,
    setGameVisibility,
  ])

  app.post("/joinGame", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    applyDueTransitions,
    joinGame,
  ])

  app.post("/unJoinGame", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    applyDueTransitions,
    verifyInGameHandler,
    unJoinGame,
  ])

  app.post("/startGame", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    applyDueTransitions,
    verifyInGameHandler,
    ownerOnlyHandler,
    startGame,
  ])

  app.post("/chooseChancellor", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    rejectDuringPause,
    verifyInGameHandler,
    presidentOnlyHandler,
    chooseChancellor,
  ])

  app.post("/vote", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    rejectDuringPause,
    verifyInGameHandler,
    vote,
  ])

  app.post("/presidentDiscardPolicy", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    rejectDuringPause,
    verifyInGameHandler,
    presidentOnlyHandler,
    presidentDiscardPolicy,
  ])

  app.post("/chancellorDiscardPolicy", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    rejectDuringPause,
    verifyInGameHandler,
    chancellorOnlyHandler,
    chancellorDiscardPolicy,
  ])

  app.post("/presidentialPower", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    rejectDuringPause,
    verifyInGameHandler,
    presidentOnlyHandler,
    presidentialPower,
  ])

  app.post("/askForVeto", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    rejectDuringPause,
    verifyInGameHandler,
    chancellorOnlyHandler,
    askForVeto,
  ])

  app.post("/answerVeto", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    rejectDuringPause,
    verifyInGameHandler,
    presidentOnlyHandler,
    answerVeto,
  ])

  // Clients call this when a pause is over, to move the game on
  app.post("/advance", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    verifyInGameHandler,
    applyDueTransitions,
    advance,
  ])

  app.post("/getGamesForSelf", [appCheckVerification, isAuthenticatedHandler, getGamesForUser])

  app.post("/getActivePublicGames", [
    appCheckVerification,
    isAuthenticatedHandler,
    getActivePublicGames,
  ])
}
