import * as admin from "firebase-admin"

import * as constants from "./constants"

/**
 * The pauses between phases (the intro, the vote results, the end of a session) are not spent
 * waiting inside a request: the request writes the new phase with a pending transition, saying
 * what comes next and at what server time. Players see the pause on the shared clock, and the
 * first request on the game once it's due applies the transition (clients call /advance at that
 * time). Actions sent during the pause are rejected.
 */
export enum TransitionKind {
  /** The intro is over: the first President chooses a Chancellor. */
  finishSetup = "finishSetup",
  /** The vote passed: the President draws 3 policies. */
  beginLegislativeSession = "beginLegislativeSession",
  /** Third failed government in a row: the top policy is enacted. */
  frustratedPopulace = "frustratedPopulace",
  /** The government's turn is over: the next President chooses a Chancellor. */
  nextElection = "nextElection",
}

export interface PendingTransition {
  /** Server time, in milliseconds, when the pause ends. */
  at: number
  kind: TransitionKind
  /** For a nextElection after a special election: the President chosen by the last one. */
  specialElectionPresidentId?: string
}

export const SHORT_INTRO_MS: number = 5_000
export const LONG_INTRO_MS: number = 30_000
/** How long players see a result (votes, an enacted policy, a power) before the game moves on. */
export const RESULT_PAUSE_MS: number = 5_000

export function pendingTransition(
  kind: TransitionKind,
  delayMs: number,
  specialElectionPresidentId?: string,
): PendingTransition {
  const transition: PendingTransition = { at: Date.now() + delayMs, kind }
  // The database rejects undefined values
  if (specialElectionPresidentId !== undefined) {
    transition.specialElectionPresidentId = specialElectionPresidentId
  }
  return transition
}

export async function scheduleTransition(
  gameCode: string,
  transition: PendingTransition,
): Promise<void> {
  await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .child(gameCode)
    .child(constants.DATABASE_NODE_PENDING_TRANSITION)
    .set(transition)
}

export function isDue(transition: PendingTransition | undefined | null): boolean {
  return transition != null && transition.at <= Date.now()
}
