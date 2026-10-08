import { randomUUID } from "crypto"

import * as admin from "firebase-admin"

import { sleep } from "../utils"

/**
 * Per-game locks, kept outside `ongoingGames` so a lock can never recreate a deleted game.
 * The database rules grant clients no access to this node.
 */
const LOCKS_NODE: string = "gameLocks"

/**
 * Longer than the function timeout (120s), so a live request never loses its lock.
 * Only a lock left behind by a killed instance ever expires.
 */
export const LOCK_TTL_MS: number = 125_000

/** How long a request waits for its turn before giving up. Covers the 30s long intro. */
export const LOCK_MAX_WAIT_MS: number = 60_000

const LOCK_RETRY_MS: number = 100

interface GameLock {
  token: string
  expiresAt: number
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
