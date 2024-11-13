import { Application } from "express"
import { isAuthenticatedHandler } from "./auth/authenticated"
import {
  answerVeto,
  askForVeto,
  chancellorDiscardPolicy,
  chooseChancellor,
  joinGame,
  newGame,
  presidentDiscardPolicy,
  presidentialPower,
  startGame,
  vote,
} from "./controller"
import { gameDataHandler } from "./handlers/game-data-handler"
import { ownerOnlyHandler } from "./handlers/owner-only-handler"
import { verifyInGameHandler } from "./handlers/verify-in-game-handler"
import { presidentOnlyHandler } from "./handlers/president-only-handler"
import { chancellorOnlyHandler } from "./handlers/chancellor-only-handler"
import { appCheckVerification } from "./appcheck/app-check-verification"

export function routesConfig(app: Application): void {
  app.post("/newGame", [
    appCheckVerification,
    isAuthenticatedHandler,
    newGame,
  ])

  app.post("/joinGame", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    joinGame,
  ])

  app.post("/startGame", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    verifyInGameHandler,
    ownerOnlyHandler,
    startGame,
  ])

  app.post("/chooseChancellor", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    verifyInGameHandler,
    presidentOnlyHandler,
    chooseChancellor,
  ])

  app.post("/vote", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    verifyInGameHandler,
    vote,
  ])

  app.post("/presidentDiscardPolicy", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    verifyInGameHandler,
    presidentOnlyHandler,
    presidentDiscardPolicy,
  ])

  app.post("/chancellorDiscardPolicy", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    verifyInGameHandler,
    chancellorOnlyHandler,
    chancellorDiscardPolicy,
  ])

  app.post("/presidentialPower", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    verifyInGameHandler,
    presidentOnlyHandler,
    presidentialPower,
  ])

  app.post("/askForVeto", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    verifyInGameHandler,
    chancellorOnlyHandler,
    askForVeto,
  ])

  app.post("/answerVeto", [
    appCheckVerification,
    isAuthenticatedHandler,
    gameDataHandler,
    verifyInGameHandler,
    presidentOnlyHandler,
    answerVeto,
  ])
}
