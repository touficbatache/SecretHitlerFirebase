/**
 * The pauses between phases (the intro, the vote results, the end of a session) are not spent
 * waiting inside a request. The rules engine ends the phase in a pause (`GameState.next`), and
 * the request stores it with the time it ends, as `pendingTransition: { at, kind }`. Players see
 * the pause on the shared clock, and the first request on the game once it's due applies it
 * (clients call /advance at that time). Actions sent during the pause are rejected.
 */

export const SHORT_INTRO_MS: number = 5_000
export const LONG_INTRO_MS: number = 30_000
/** How long players see a result (votes, an enacted policy, a power) before the game moves on. */
export const RESULT_PAUSE_MS: number = 5_000
