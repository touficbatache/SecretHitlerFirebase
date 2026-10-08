import { Response } from "express"

/**
 * Dev mode lets one client simulate several players without logging in:
 * authentication and role checks are skipped and fake player ids are generated.
 *
 * It only activates inside the Firebase emulator, which sets FUNCTIONS_EMULATOR
 * automatically. A DEV=true that ends up in a deployed .env file is ignored.
 */
export function isDevMode(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true" && process.env.DEV === "true"
}

/** In dev mode, a request with this header acts as that player, with every check applied. */
export const DEV_UID_HEADER: string = "X-Dev-Uid"

/**
 * Whether the request is simulated: dev mode without the X-Dev-Uid header. Checks on who the
 * player is are skipped, and the server acts as whoever's turn it is.
 */
export function isSimulated(res: Response): boolean {
  return isDevMode() && res.locals.uid === undefined
}
