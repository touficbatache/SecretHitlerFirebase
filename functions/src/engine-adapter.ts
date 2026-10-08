/**
 * Converts between a game as stored in the Realtime Database and the rules engine's state.
 *
 * The database format doesn't change: the frontend and every existing game keep working. A
 * request reads the game, converts it, runs the engine, then writes back only what changed, in
 * the same fields and encodings as before (comma-separated policy lists, status plus subStatus…).
 */
import * as constants from "./constants"
import {
  ChaosRecord,
  GameState,
  HistoryEntry,
  Phase,
  Player,
  Policy,
  Power,
  Role,
  Session,
  Transition,
} from "./engine"
import { LONG_INTRO_MS, RESULT_PAUSE_MS, SHORT_INTRO_MS } from "./pending-transition"

/** Statuses of a game whose rules have started: from the intro to the end. */
const STARTED_STATUSES: string[] = [
  "settingUp",
  "election",
  "legislativeSession",
  "presidentialPower",
  "gameEnded",
]

export function hasStarted(game: any): boolean {
  return STARTED_STATUSES.includes(game?.[constants.DATABASE_NODE_STATUS])
}

/** A game as `getGameData` returns it (players and sessions as arrays), as the engine's state. */
export function toEngineState(game: any): GameState {
  if (!hasStarted(game)) {
    throw new Error(`Game in status ${game?.[constants.DATABASE_NODE_STATUS]} has no rules state`)
  }

  const policies: any = game[constants.DATABASE_NODE_CHAMBER_POLICIES] ?? {}
  const currentSession: any = game[constants.DATABASE_NODE_CURRENT_SESSION]
  const players: Player[] = (game[constants.DATABASE_NODE_PLAYERS] ?? []).map(
    (player: any): Player => ({
      id: player[constants.DATABASE_NODE_ID],
      role: player[constants.DATABASE_NODE_ROLE] as Role,
      isAlive: player[constants.DATABASE_NODE_IS_EXECUTED] !== true,
      wasInvestigated: player[constants.DATABASE_NODE_IS_INVESTIGATED] === true,
    }),
  )

  const state: GameState = {
    players,
    powers: Object.fromEntries(
      Object.entries(game[constants.DATABASE_NODE_EXECUTIVE_ACTIONS] ?? {}).map(
        ([position, power]: [string, unknown]) => [Number(position), power as Power],
      ),
    ),
    drawPile: policyList(policies[constants.DATABASE_NODE_DRAW_PILE]) ?? [],
    discardPile: counts(policies[constants.DATABASE_NODE_DISCARD_PILE]),
    board: counts(policies[constants.DATABASE_NODE_BOARD]),
    electionTracker: game[constants.DATABASE_NODE_ELECTION_TRACKER] ?? 0,
    rotationPresidentId: game[constants.DATABASE_NODE_LAST_PRESIDENT_ID],
    termLimits: withoutUndefined({
      presidentId: game[constants.DATABASE_NODE_LAST_SUCCESSFUL_PRESIDENT_ID] ?? undefined,
      chancellorId: game[constants.DATABASE_NODE_LAST_SUCCESSFUL_CHANCELLOR_ID] ?? undefined,
    }),
    session:
      currentSession?.[constants.DATABASE_NODE_PRESIDENT_ID] != null
        ? toSession(currentSession, game[constants.DATABASE_NODE_SPECIAL_ELECTION_PLAYER])
        : undefined,
    history: (game[constants.DATABASE_NODE_SESSIONS] ?? []).map(toHistoryEntry),
    phase: toPhase(game, players),
    next: toTransition(game[constants.DATABASE_NODE_PENDING_TRANSITION]),
  }
  return state
}

function toSession(session: any, specialElectionPlayer: unknown): Session {
  const power: string | undefined = session[constants.DATABASE_NODE_PRESIDENTIAL_POWER]
  return withoutUndefined({
    presidentId: session[constants.DATABASE_NODE_PRESIDENT_ID],
    isSpecialElection: session[constants.DATABASE_NODE_IS_SPECIAL_ELECTION] === true,
    chancellorId: session[constants.DATABASE_NODE_CHANCELLOR_ID] ?? undefined,
    votes: { ...(session[constants.DATABASE_NODE_VOTES] ?? {}) },
    passed: session[constants.DATABASE_NODE_HAS_SUCCEEDED] ?? undefined,
    presidentPolicies: policyList(session[constants.DATABASE_NODE_PRESIDENT_POLICIES]),
    chancellorPolicies: policyList(session[constants.DATABASE_NODE_CHANCELLOR_POLICIES]),
    vetoRefused: session[constants.DATABASE_NODE_IS_VETO_REFUSED] ?? undefined,
    enactedPolicy: session[constants.DATABASE_NODE_ENACTED_POLICY] ?? undefined,
    power: power?.startsWith("presidentialPower_")
      ? (power.slice("presidentialPower_".length) as Power)
      : undefined,
    peekedPolicies: policyList(session[constants.DATABASE_NODE_POLICY_PEEK_THREE_POLICIES]),
    investigatedId: session[constants.DATABASE_NODE_BEING_INVESTIGATED_PLAYER_ID] ?? undefined,
    specialElectionPresidentId:
      typeof specialElectionPlayer === "string" ? specialElectionPlayer : undefined,
    executedId: session[constants.DATABASE_NODE_EXECUTED_PLAYER_ID] ?? undefined,
  }) as Session
}

function toHistoryEntry(entry: any): HistoryEntry {
  if (entry?.[constants.DATABASE_NODE_ENACTMENT_BY_FRUSTRATED_POPULACE] === true) {
    const chaos: ChaosRecord = {
      chaos: true,
      enactedPolicy: entry[constants.DATABASE_NODE_ENACTED_POLICY],
    }
    return chaos
  }
  // While a session is current, its special election is stored at the top of the game; once
  // archived, in the session itself (games from before the engine don't have it there)
  return toSession(entry, entry?.[constants.DATABASE_NODE_SPECIAL_ELECTION_PLAYER])
}

const PHASES_BY_SUB_STATUS: Record<string, Phase["name"]> = {
  election_presidentChoosingChancellor: "nomination",
  election_voting: "voting",
  election_votingEnded: "voteResult",
  legislativeSession_presidentDiscardingPolicy: "presidentDiscard",
  legislativeSession_chancellorDiscardingPolicy: "chancellorDiscard",
  legislativeSession_chancellorSeekingVeto: "vetoRequested",
  legislativeSession_sessionEndedWithVeto: "vetoAccepted",
  legislativeSession_sessionEndedWithPolicyEnactment: "policyEnacted",
}

function toPhase(game: any, players: Player[]): Phase {
  const status: string = game[constants.DATABASE_NODE_STATUS]
  const subStatus: string = game[constants.DATABASE_NODE_SUB_STATUS] ?? ""
  if (status === "settingUp") return { name: "intro" }

  if (subStatus.startsWith("presidentialPower_")) {
    const progress: string | undefined = game[constants.DATABASE_NODE_PRESIDENTIAL_POWER]
    const power: Power = subStatus.slice("presidentialPower_".length) as Power
    const twoSteps: boolean = power === "policyPeek" || power === "investigateLoyalty"
    return {
      name: "power",
      power,
      used: twoSteps && (progress === "consumed" || progress === "done"),
      done: progress === "done",
    }
  }

  if (subStatus.startsWith("gameEnded_")) {
    const board: { liberal: number; fascist: number } = counts(
      game[constants.DATABASE_NODE_CHAMBER_POLICIES]?.[constants.DATABASE_NODE_BOARD],
    )
    const hitlerAlive: boolean = players.some((p: Player) => p.role === "hitler" && p.isAlive)
    // The reason isn't stored: it follows from the board and Hitler's fate
    return subStatus === "gameEnded_liberal"
      ? {
          name: "gameOver",
          winner: "liberal",
          reason: board.liberal >= 5 || hitlerAlive ? "liberalPolicies" : "hitlerExecuted",
        }
      : {
          name: "gameOver",
          winner: "fascist",
          reason: board.fascist >= 6 ? "fascistPolicies" : "hitlerElected",
        }
  }

  const phase: Phase["name"] | undefined = PHASES_BY_SUB_STATUS[subStatus]
  if (phase === undefined) throw new Error(`Unknown game phase ${status}/${subStatus}`)
  return { name: phase } as Phase
}

function toTransition(pending: any): Transition | undefined {
  const kind: unknown = pending?.kind
  switch (kind) {
    case "finishSetup":
    case "beginLegislativeSession":
    case "frustratedPopulace":
    case "nextElection":
      return { kind }
    default:
      return undefined
  }
}

/**
 * The engine's state in the database's format: only the fields the rules own. Player names,
 * pictures, settings, presence and the like aren't in it, so they are never touched.
 */
export function toDatabase(state: GameState): Record<string, unknown> {
  const { phase, session } = state
  const status: Record<Phase["name"], string> = {
    intro: "settingUp",
    nomination: "election",
    voting: "election",
    voteResult: "election",
    presidentDiscard: "legislativeSession",
    chancellorDiscard: "legislativeSession",
    vetoRequested: "legislativeSession",
    vetoAccepted: "legislativeSession",
    policyEnacted: "legislativeSession",
    power: "presidentialPower",
    gameOver: "gameEnded",
  }
  const subStatus: string | undefined =
    phase.name === "intro"
      ? undefined
      : phase.name === "power"
      ? `presidentialPower_${phase.power}`
      : phase.name === "gameOver"
      ? `gameEnded_${phase.winner}`
      : Object.keys(PHASES_BY_SUB_STATUS).find(
          (key: string) => PHASES_BY_SUB_STATUS[key] === phase.name,
        )

  return withoutUndefined({
    [constants.DATABASE_NODE_PLAYERS]: state.players.map((player: Player) =>
      withoutUndefined({
        [constants.DATABASE_NODE_ID]: player.id,
        [constants.DATABASE_NODE_ROLE]: player.role,
        [constants.DATABASE_NODE_IS_EXECUTED]: player.isAlive ? undefined : true,
        [constants.DATABASE_NODE_IS_INVESTIGATED]: player.wasInvestigated ? true : undefined,
      }),
    ),
    [constants.DATABASE_NODE_EXECUTIVE_ACTIONS]: Object.fromEntries(
      Object.entries(state.powers).map(([position, power]: [string, unknown]) => [position, power]),
    ),
    [constants.DATABASE_NODE_CHAMBER_POLICIES]: withoutUndefined({
      [constants.DATABASE_NODE_DRAW_PILE]: csv(state.drawPile),
      [constants.DATABASE_NODE_DISCARD_PILE]: nonZero(state.discardPile),
      [constants.DATABASE_NODE_BOARD]: nonZero(state.board),
    }),
    [constants.DATABASE_NODE_ELECTION_TRACKER]: state.electionTracker,
    [constants.DATABASE_NODE_LAST_PRESIDENT_ID]: state.rotationPresidentId,
    [constants.DATABASE_NODE_LAST_SUCCESSFUL_PRESIDENT_ID]: state.termLimits.presidentId,
    [constants.DATABASE_NODE_LAST_SUCCESSFUL_CHANCELLOR_ID]: state.termLimits.chancellorId,
    [constants.DATABASE_NODE_CURRENT_SESSION]:
      session === undefined ? undefined : fromSession(session),
    [constants.DATABASE_NODE_SESSIONS]: state.history.map(fromHistoryEntry),
    [constants.DATABASE_NODE_STATUS]: status[phase.name],
    [constants.DATABASE_NODE_SUB_STATUS]: subStatus,
    [constants.DATABASE_NODE_PRESIDENTIAL_POWER]:
      phase.name !== "power"
        ? undefined
        : phase.done
        ? "done"
        : phase.used
        ? "consumed"
        : undefined,
    [constants.DATABASE_NODE_SPECIAL_ELECTION_PLAYER]: session?.specialElectionPresidentId,
  })
}

/**
 * A session in the database's format. The current session's special election is stored at the
 * top of the game, where the frontend reads it, so it's only stored here once archived.
 */
function fromSession(session: Session, archived: boolean = false): Record<string, unknown> {
  return withoutUndefined({
    [constants.DATABASE_NODE_PRESIDENT_ID]: session.presidentId,
    [constants.DATABASE_NODE_IS_SPECIAL_ELECTION]: session.isSpecialElection,
    [constants.DATABASE_NODE_CHANCELLOR_ID]: session.chancellorId,
    [constants.DATABASE_NODE_VOTES]: session.votes,
    [constants.DATABASE_NODE_HAS_SUCCEEDED]: session.passed,
    [constants.DATABASE_NODE_PRESIDENT_POLICIES]: csv(session.presidentPolicies),
    [constants.DATABASE_NODE_CHANCELLOR_POLICIES]: csv(session.chancellorPolicies),
    [constants.DATABASE_NODE_IS_VETO_REFUSED]: session.vetoRefused,
    [constants.DATABASE_NODE_ENACTED_POLICY]: session.enactedPolicy,
    [constants.DATABASE_NODE_PRESIDENTIAL_POWER]:
      session.power === undefined ? undefined : `presidentialPower_${session.power}`,
    [constants.DATABASE_NODE_POLICY_PEEK_THREE_POLICIES]: csv(session.peekedPolicies),
    [constants.DATABASE_NODE_BEING_INVESTIGATED_PLAYER_ID]: session.investigatedId,
    [constants.DATABASE_NODE_EXECUTED_PLAYER_ID]: session.executedId,
    [constants.DATABASE_NODE_SPECIAL_ELECTION_PLAYER]: archived
      ? session.specialElectionPresidentId
      : undefined,
  })
}

function fromHistoryEntry(entry: HistoryEntry): Record<string, unknown> {
  if ("chaos" in entry) {
    return {
      [constants.DATABASE_NODE_IS_SPECIAL_ELECTION]: false,
      [constants.DATABASE_NODE_HAS_SUCCEEDED]: false,
      [constants.DATABASE_NODE_ENACTED_POLICY]: entry.enactedPolicy,
      [constants.DATABASE_NODE_ENACTMENT_BY_FRUSTRATED_POPULACE]: true,
    }
  }
  return fromSession(entry, true)
}

/**
 * The database writes that turn `before` into `after`, as a multi-path update of the game
 * node. Only changed values are written, so nothing outside the rules' fields is touched, and
 * archived sessions are only ever added.
 *
 * @param settings the game's settings, for the length of the intro.
 */
export function databaseUpdates(
  before: GameState,
  after: GameState,
  settings: { skipLongIntro?: boolean } | undefined,
  now: number = Date.now(),
): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  diff(toDatabase(before), toDatabase(after), "", updates)

  const transitionChanged: boolean =
    before.next?.kind !== after.next?.kind ||
    (after.next !== undefined && before.phase.name !== after.phase.name)
  if (transitionChanged) {
    updates[constants.DATABASE_NODE_PENDING_TRANSITION] =
      after.next === undefined ? null : pendingTransition(after, settings, now)
  }
  return updates
}

/** The `pendingTransition` node for a state in a pause: what comes next, and when. */
export function pendingTransition(
  state: GameState,
  settings: { skipLongIntro?: boolean } | undefined,
  now: number,
): Record<string, unknown> {
  const next: Transition = state.next as Transition
  const delayMs: number =
    next.kind === "finishSetup"
      ? settings?.skipLongIntro === true
        ? SHORT_INTRO_MS
        : LONG_INTRO_MS
      : RESULT_PAUSE_MS
  return withoutUndefined({
    at: now + delayMs,
    kind: next.kind,
    specialElectionPresidentId:
      next.kind === "nextElection" ? state.session?.specialElectionPresidentId : undefined,
  })
}

/** Collects, under `path`, the writes that turn `from` into `to`. */
function diff(from: unknown, to: unknown, path: string, updates: Record<string, unknown>): void {
  if (isTree(from) && isTree(to)) {
    const keys: Set<string> = new Set([...Object.keys(from), ...Object.keys(to)])
    for (const key of keys) {
      diff(from[key], to[key], path === "" ? key : `${path}/${key}`, updates)
    }
    return
  }
  if (JSON.stringify(from) === JSON.stringify(to)) return
  updates[path] = to === undefined ? null : to
}

function isTree(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** Policy lists are stored as comma-separated strings. */
function csv(policies: Policy[] | undefined): string | undefined {
  return policies === undefined || policies.length === 0 ? undefined : policies.join(",")
}

function policyList(value: unknown): Policy[] | undefined {
  if (Array.isArray(value)) return value.length > 0 ? (value as Policy[]) : undefined
  if (typeof value === "string" && value.length > 0) return value.split(",") as Policy[]
  return undefined
}

function counts(value: any): { liberal: number; fascist: number } {
  return { liberal: value?.liberal ?? 0, fascist: value?.fascist ?? 0 }
}

function nonZero(value: { liberal: number; fascist: number }): Record<string, number> | undefined {
  const result: Record<string, number> = {}
  if (value.liberal > 0) result.liberal = value.liberal
  if (value.fascist > 0) result.fascist = value.fascist
  return Object.keys(result).length > 0 ? result : undefined
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]: [string, unknown]) => v !== undefined),
  ) as T
}
