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

export function routesConfig(app: Application) {
    app.post("/newGame", [
        isAuthenticatedHandler,
        newGame,
    ])

    app.post("/joinGame", [
        isAuthenticatedHandler,
        gameDataHandler,
        joinGame,
    ])

    app.post("/startGame", [
        isAuthenticatedHandler,
        gameDataHandler,
        verifyInGameHandler,
        ownerOnlyHandler,
        startGame,
    ])

    app.post("/chooseChancellor", [
        isAuthenticatedHandler,
        gameDataHandler,
        verifyInGameHandler,
        presidentOnlyHandler,
        chooseChancellor,
    ])

    app.post("/vote", [
        isAuthenticatedHandler,
        gameDataHandler,
        verifyInGameHandler,
        vote,
    ])

    app.post("/presidentDiscardPolicy", [
        isAuthenticatedHandler,
        gameDataHandler,
        verifyInGameHandler,
        presidentOnlyHandler,
        presidentDiscardPolicy,
    ])

    app.post("/chancellorDiscardPolicy", [
        isAuthenticatedHandler,
        gameDataHandler,
        verifyInGameHandler,
        chancellorOnlyHandler,
        chancellorDiscardPolicy,
    ])

    app.post("/presidentialPower", [
        isAuthenticatedHandler,
        gameDataHandler,
        verifyInGameHandler,
        presidentOnlyHandler,
        presidentialPower,
    ])

    app.post("/askForVeto", [
        isAuthenticatedHandler,
        gameDataHandler,
        verifyInGameHandler,
        chancellorOnlyHandler,
        askForVeto,
    ])

    app.post("/answerVeto", [
        isAuthenticatedHandler,
        gameDataHandler,
        verifyInGameHandler,
        presidentOnlyHandler,
        answerVeto,
    ])
}