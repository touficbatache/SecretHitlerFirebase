// Firebase imports
import * as functions from "firebase-functions"
import * as admin from "firebase-admin"

// Express.js imports
import * as express from "express"
import * as cors from "cors"
import { routesConfig } from "./routes-config"
import { Express } from "express-serve-static-core"

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
export const api = functions.https.onRequest(app)
