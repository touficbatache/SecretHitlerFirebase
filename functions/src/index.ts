// Firebase & Express.js imports
import * as cors from "cors"
import * as express from "express"
import { Express } from "express-serve-static-core"
import * as admin from "firebase-admin"
import * as functions from "firebase-functions"

// import { onSchedule } from "firebase-functions/v2/scheduler"
import { routesConfig } from "./routes-config"
// import { getGameData, getInactiveGameCodes } from "./handlers/game-data-handler"

/**
 * Initialize Express API,
 * allow cross-origin requests, and
 * add JSON middleware to authenticate requests
 */
const app: Express = express()
app.use(cors({ origin: true }))
app.use(express.json())

/**
 * Initialize Firebase
 */
admin.initializeApp()

/**
 * Plug API into routes
 */
routesConfig(app)

/**
 * Expose Express API as a single Cloud Function,
 * accessible via "/api/"
 */
export const api: functions.https.HttpsFunction = functions.https.onRequest(app)
