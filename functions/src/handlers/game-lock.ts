import { AsyncLocalStorage } from "async_hooks"
import { randomUUID } from "crypto"

import * as admin from "firebase-admin"

import { sleep } from "../utils"

/**
 * Per-game locks, kept outside `ongoingGames` so a lock can never recreate a deleted game.
 * The database rules grant clients no access to this node.
 */
const LOCKS_NODE: string = "gameLocks"

/**
 * How long a lock lives if its request never releases it, e.g. a killed instance.
 *
 * The lock is released during pauses (see pauseGame), so a request only holds it for a
 * few quick database reads and writes in a row. 20s is far longer than that, and caps
 * how long a crash can freeze a game.
 */
export const LOCK_TTL_MS: number = 20_000

/** How long a request waits for its turn before giving up. Covers the 30s long intro. */
export const LOCK_MAX_WAIT_MS: number = 60_000

const LOCK_RETRY_MS: number = 100

interface GameLock {
  token: string
  expiresAt: number
}

/** The lock held by the current request. `token` is undefined while the request is paused. */
export interface GameLockContext {
  gameCode: string
  token: string | undefined
}

const lockContext: AsyncLocalStorage<GameLockContext> = new AsyncLocalStorage<GameLockContext>()

/** Runs `fn`, and everything it awaits, as the holder of `context`'s lock. */
export function runWithGameLock(context: GameLockContext, fn: () => void): void {
  lockContext.run(context, fn)
}

/**
 * Pauses the game for `ms` between two phases, such as the intro or the vote reveal.
 *
 * The lock is released during the pause, so actions that arrive in the meantime are
 * checked against the paused phase and rejected right away, instead of waiting and
 * being applied to a phase they were never meant for. The lock is taken back before
 * continuing, so callers must re-read the game after pausing.
 */
export async function pauseGame(ms: number): Promise<void> {
  const context: GameLockContext | undefined = lockContext.getStore()
  if (context?.token === undefined) {
    await sleep(ms)
    return
  }

  await releaseGameLock(context.gameCode, context.token)
  context.token = undefined

  await sleep(ms)

  const token: string | undefined = await acquireGameLock(context.gameCode)
  if (token === undefined) {
    throw new Error(`Could not take back the lock of game ${context.gameCode} after a pause`)
  }
  context.token = token
}

/**
 * Waits until this request holds the game's lock. Returns the lock token, or undefined
 * if the lock stayed busy for LOCK_MAX_WAIT_MS.
 */
export async function acquireGameLock(gameCode: string): Promise<string | undefined> {
  const token: string = randomUUID()
  const ref: admin.database.Reference = admin.database().ref(LOCKS_NODE).child(gameCode)
  const deadline: number = Date.now() + LOCK_MAX_WAIT_MS

  while (Date.now() < deadline) {
    // The transaction may first run with `null` even if a lock exists (nothing cached yet).
    // Writing a lock then fails on the server, which reruns this with the real value.
    const result: { committed: boolean; snapshot: admin.database.DataSnapshot } =
      await ref.transaction((current: GameLock | null) => {
        const now: number = Date.now()
        if (current === null || current.expiresAt <= now) {
          return { token, expiresAt: now + LOCK_TTL_MS }
        }
        return undefined // held by another request: abort and retry after a pause
      })

    if (result.committed && result.snapshot.val()?.token === token) {
      return token
    }

    await sleep(LOCK_RETRY_MS + Math.random() * LOCK_RETRY_MS)
  }

  return undefined
}

/** Releases the lock if this token still holds it. */
export async function releaseGameLock(gameCode: string, token: string): Promise<void> {
  await admin
    .database()
    .ref(LOCKS_NODE)
    .child(gameCode)
    .transaction((current: GameLock | null) => {
      // `null` may just mean "not cached yet": try to delete, and the server reruns
      // this with the real value if a lock exists.
      if (current === null || current.token === token) {
        return null
      }
      return undefined // someone else's lock (ours expired): leave it alone
    })
}
