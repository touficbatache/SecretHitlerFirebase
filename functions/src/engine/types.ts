/**
 * The state of a Secret Hitler game, and the actions that change it. Plain data: it can be
 * stored, sent and compared as JSON.
 */

export type Policy = "liberal" | "fascist"

export type Role = "liberal" | "fascist" | "hitler"

export type Team = "liberal" | "fascist"

export type Power = "policyPeek" | "investigateLoyalty" | "callSpecialElection" | "execution"

export interface Player {
  id: string
  role: Role
  isAlive: boolean
  /** Investigated players can't be investigated again. */
  wasInvestigated: boolean
}

export interface PolicyCounts {
  liberal: number
  fascist: number
}

/** One government's turn: the nomination, the vote, the legislative session and any power. */
export interface Session {
  presidentId: string
  isSpecialElection: boolean
  chancellorId?: string
  /** Votes cast so far, by player id: true is Ja, false is Nein. */
  votes: Record<string, boolean>
  /** Whether the government was elected, once every living player has voted. */
  passed?: boolean
  /** The 3 policies the President drew. */
  presidentPolicies?: Policy[]
  /** The 2 policies the President passed to the Chancellor. */
  chancellorPolicies?: Policy[]
  /** The President refused the Chancellor's veto: the Chancellor must enact a policy. */
  vetoRefused?: boolean
  enactedPolicy?: Policy
  /** What a policy peek showed the President. */
  peekedPolicies?: Policy[]
  investigatedId?: string
  specialElectionPresidentId?: string
  executedId?: string
}

/** A policy enacted by the frustrated populace after three failed governments in a row. */
export interface ChaosRecord {
  chaos: true
  enactedPolicy: Policy
}

export type HistoryEntry = Session | ChaosRecord

/**
 * Where the game is. While `GameState.next` is set, the game is in a pause (the intro, or a
 * result being shown) and only `{ type: "continue" }` moves it on.
 */
export type Phase =
  | { name: "intro" }
  | { name: "nomination" }
  | { name: "voting" }
  | { name: "voteResult" }
  | { name: "presidentDiscard" }
  | { name: "chancellorDiscard" }
  | { name: "vetoRequested" }
  | { name: "vetoAccepted" }
  | { name: "policyEnacted" }
  /**
   * A presidential power. `used` is set once a policy peek or an investigation has shown the
   * President its result, until they end it. `done` is set once the power is over.
   */
  | { name: "power"; power: Power; used: boolean; done: boolean }
  | { name: "gameOver"; winner: Team; reason: WinReason }

export type WinReason = "liberalPolicies" | "fascistPolicies" | "hitlerElected" | "hitlerExecuted"

/** What happens when the current pause is over. */
export type Transition =
  /** The intro is over: the first President chooses a Chancellor. */
  | { kind: "finishSetup" }
  /** The vote passed: the President draws 3 policies. */
  | { kind: "beginLegislativeSession" }
  /** Third failed government in a row: the top policy is enacted. */
  | { kind: "frustratedPopulace" }
  /** The government's turn is over: the next President, or the one a special election chose. */
  | { kind: "nextElection" }

export interface GameState {
  /** In seating order: the presidency passes to the next living player in this list. */
  players: Player[]
  /** The power granted by each fascist policy, by how many fascist policies are on the board. */
  powers: Partial<Record<number, Power>>
  /** Top of the pile first. */
  drawPile: Policy[]
  discardPile: PolicyCounts
  board: PolicyCounts
  /** Failed governments in a row. */
  electionTracker: number
  /** The President the normal rotation continues from: special elections don't move it. */
  rotationPresidentId: string
  /** The last elected government, which can't be nominated as Chancellor. */
  termLimits: { presidentId?: string; chancellorId?: string }
  /** The current government. Undefined once the game is over. */
  session: Session | undefined
  /** Past governments and chaos enactments, oldest first. */
  history: HistoryEntry[]
  phase: Phase
  /** Set during a pause: what `continue` will do. */
  next: Transition | undefined
}

export type Action =
  | { type: "nominate"; by: string; chancellorId: string }
  | { type: "vote"; by: string; ja: boolean }
  /** The President or the Chancellor discards a policy, depending on the phase. */
  | { type: "discard"; by: string; policy: Policy }
  | { type: "proposeVeto"; by: string }
  | { type: "answerVeto"; by: string; accept: boolean }
  /** Uses the current presidential power. Every power but the policy peek needs a target. */
  | { type: "usePower"; by: string; targetId?: string }
  /** The President has seen the policy peek or the investigation result, and moves on. */
  | { type: "endPower"; by: string }
  /** The pause is over. Sent by the server, not a player. */
  | { type: "continue" }

export type RuleErrorCode =
  /** The action doesn't belong in this phase, or the game is paused. */
  | "wrongPhase"
  /** It isn't this player's turn, or this player can't do that. */
  | "notYourTurn"
  /** The chosen player can't be chosen: dead, term-limited, investigated before... */
  | "ineligible"
  /** The action is malformed: a policy that isn't in hand, a missing target... */
  | "invalidAction"

export interface RuleError {
  code: RuleErrorCode
  message: string
}

/**
 * The outcome of `apply`. Both shapes name both fields, so `result.error` and `result.state` can
 * be read without narrowing, which code compiled without `strict` can't always do.
 */
export type ApplyResult =
  | { ok: true; state: GameState; error?: undefined }
  | { ok: false; state?: undefined; error: RuleError }

/** A source of random numbers in [0, 1), like Math.random. */
export type Rng = () => number
