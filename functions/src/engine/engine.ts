import { shuffle } from "./rng"
import {
  ELECTION_TRACKER_LIMIT,
  FASCIST_POLICIES,
  FASCIST_POLICIES_TO_WIN,
  HITLER_CHANCELLOR_FASCIST_POLICIES,
  LIBERAL_POLICIES,
  LIBERAL_POLICIES_TO_WIN,
  MAX_PLAYERS,
  MIN_DRAW_PILE,
  MIN_PLAYERS,
  powersFor,
  ROLE_COUNTS,
  SMALL_GAME_ALIVE_PLAYERS,
  VETO_FASCIST_POLICIES,
} from "./rules"
import {
  Action,
  ApplyResult,
  GameState,
  Player,
  Policy,
  Power,
  Role,
  RuleErrorCode,
  Rng,
  Session,
  Team,
  WinReason,
} from "./types"

/**
 * Deals the roles, shuffles the policies and picks the first President at random. The game
 * starts with the intro: `continue` begins the first election.
 *
 * @param playerIds in seating order.
 */
export function setupGame(playerIds: string[], rng: Rng): GameState {
  const count: number = playerIds.length
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new Error(`Secret Hitler needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, not ${count}`)
  }
  if (new Set(playerIds).size !== count) {
    throw new Error("Player ids must be unique")
  }

  const { liberals, fascists } = ROLE_COUNTS[count]
  const roles: Role[] = shuffle(
    ["hitler", ...Array<Role>(liberals).fill("liberal"), ...Array<Role>(fascists).fill("fascist")],
    rng,
  )
  const players: Player[] = playerIds.map((id: string, i: number) => ({
    id,
    role: roles[i],
    isAlive: true,
    wasInvestigated: false,
  }))

  const drawPile: Policy[] = shuffle(
    [
      ...Array<Policy>(LIBERAL_POLICIES).fill("liberal"),
      ...Array<Policy>(FASCIST_POLICIES).fill("fascist"),
    ],
    rng,
  )

  const firstPresidentId: string = playerIds[Math.floor(rng() * count)]

  return {
    players,
    powers: powersFor(count),
    drawPile,
    discardPile: { liberal: 0, fascist: 0 },
    board: { liberal: 0, fascist: 0 },
    electionTracker: 0,
    rotationPresidentId: firstPresidentId,
    termLimits: {},
    session: { presidentId: firstPresidentId, isSpecialElection: false, votes: {} },
    history: [],
    phase: { name: "intro" },
    next: { kind: "finishSetup" },
  }
}

/**
 * Applies an action, following the rules. Returns the new state, or why the action isn't
 * allowed. The given state is never changed.
 */
export function apply(state: GameState, action: Action, rng: Rng): ApplyResult {
  const game: Game = new Game(structuredClone(state), rng)
  try {
    game.apply(action)
    return { ok: true, state: game.state }
  } catch (error) {
    if (error instanceof RuleViolation) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    throw error
  }
}

/**
 * Every action allowed right now, for every player. Useful for bots, AI training and tests:
 * each of these is accepted by `apply`.
 */
export function legalActions(state: GameState): Action[] {
  const { phase, session } = state
  if (state.next !== undefined) return [{ type: "continue" }]
  if (session === undefined) return []

  const president: string = session.presidentId
  const chancellor: string | undefined = session.chancellorId
  const alive: Player[] = state.players.filter((p: Player) => p.isAlive)

  switch (phase.name) {
    case "nomination":
      return alive
        .filter((p: Player) => isEligibleForChancellor(state, p.id))
        .map((p: Player) => ({ type: "nominate", by: president, chancellorId: p.id }))
    case "voting":
      return alive
        .filter((p: Player) => session.votes[p.id] === undefined)
        .flatMap((p: Player): Action[] => [
          { type: "vote", by: p.id, ja: true },
          { type: "vote", by: p.id, ja: false },
        ])
    case "presidentDiscard":
      return distinct(session.presidentPolicies ?? []).map(
        (policy: Policy): Action => ({ type: "discard", by: president, policy }),
      )
    case "chancellorDiscard": {
      const by: string = chancellor as string
      const actions: Action[] = distinct(session.chancellorPolicies ?? []).map(
        (policy: Policy): Action => ({ type: "discard", by, policy }),
      )
      if (canProposeVeto(state)) actions.push({ type: "proposeVeto", by })
      return actions
    }
    case "vetoRequested":
      return [
        { type: "answerVeto", by: president, accept: true },
        { type: "answerVeto", by: president, accept: false },
      ]
    case "power":
      if (phase.done) return []
      if (phase.used) return [{ type: "endPower", by: president }]
      if (phase.power === "policyPeek") return [{ type: "usePower", by: president }]
      return alive
        .filter((p: Player) => isValidPowerTarget(state, phase.power, p.id))
        .map((p: Player): Action => ({ type: "usePower", by: president, targetId: p.id }))
    default:
      return []
  }
}

/**
 * Official rules: the Chancellor must be another living player, and the last elected President
 * and Chancellor are term-limited. With 5 or fewer players alive, only the last elected
 * Chancellor is.
 */
export function isEligibleForChancellor(state: GameState, candidateId: string): boolean {
  const candidate: Player | undefined = findPlayer(state, candidateId)
  if (candidate === undefined || !candidate.isAlive) return false
  if (candidateId === state.session?.presidentId) return false
  if (candidateId === state.termLimits.chancellorId) return false
  const aliveCount: number = state.players.filter((p: Player) => p.isAlive).length
  if (aliveCount > SMALL_GAME_ALIVE_PLAYERS && candidateId === state.termLimits.presidentId) {
    return false
  }
  return true
}

function isValidPowerTarget(state: GameState, power: Power, targetId: string): boolean {
  const target: Player | undefined = findPlayer(state, targetId)
  if (target === undefined || !target.isAlive || targetId === state.session?.presidentId) {
    return false
  }
  // No player may be investigated twice
  return !(power === "investigateLoyalty" && target.wasInvestigated)
}

function canProposeVeto(state: GameState): boolean {
  return state.board.fascist >= VETO_FASCIST_POLICIES && state.session?.vetoRefused !== true
}

function findPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p: Player) => p.id === id)
}

function distinct<T>(items: T[]): T[] {
  return [...new Set(items)]
}

class RuleViolation extends Error {
  constructor(
    readonly code: RuleErrorCode,
    message: string,
  ) {
    super(message)
  }
}

function fail(code: RuleErrorCode, message: string): never {
  throw new RuleViolation(code, message)
}

/** Applies one action to a state it owns (a copy), changing it in place. */
class Game {
  constructor(
    readonly state: GameState,
    private readonly rng: Rng,
  ) {}

  apply(action: Action): void {
    if (this.state.phase.name === "gameOver") fail("wrongPhase", "The game is over")

    if (action.type === "continue") {
      this.continue()
      return
    }
    if (this.state.next !== undefined) {
      fail("wrongPhase", "The game is paused between two phases")
    }

    switch (action.type) {
      case "nominate":
        return this.nominate(action.by, action.chancellorId)
      case "vote":
        return this.vote(action.by, action.ja)
      case "discard":
        return this.state.phase.name === "presidentDiscard"
          ? this.presidentDiscard(action.by, action.policy)
          : this.chancellorDiscard(action.by, action.policy)
      case "proposeVeto":
        return this.proposeVeto(action.by)
      case "answerVeto":
        return this.answerVeto(action.by, action.accept)
      case "usePower":
        return this.usePower(action.by, action.targetId)
      case "endPower":
        return this.endPower(action.by)
    }
  }

  private get session(): Session {
    return this.state.session as Session
  }

  private expectPhase(name: GameState["phase"]["name"]): void {
    if (this.state.phase.name !== name) {
      fail("wrongPhase", `Not allowed during ${this.state.phase.name}`)
    }
  }

  private expectPresident(by: string): void {
    if (by !== this.session.presidentId) fail("notYourTurn", "Only the President can do that")
  }

  private expectChancellor(by: string): void {
    if (by !== this.session.chancellorId) fail("notYourTurn", "Only the Chancellor can do that")
  }

  private nominate(by: string, chancellorId: string): void {
    this.expectPhase("nomination")
    this.expectPresident(by)
    if (!isEligibleForChancellor(this.state, chancellorId)) {
      fail("ineligible", "This player can't be nominated Chancellor")
    }
    this.session.chancellorId = chancellorId
    this.state.phase = { name: "voting" }
  }

  private vote(by: string, ja: boolean): void {
    this.expectPhase("voting")
    const voter: Player | undefined = findPlayer(this.state, by)
    if (voter === undefined || !voter.isAlive) fail("notYourTurn", "Only living players vote")
    if (this.session.votes[by] !== undefined) fail("notYourTurn", "This player already voted")

    this.session.votes[by] = ja

    const alive: Player[] = this.state.players.filter((p: Player) => p.isAlive)
    if (Object.keys(this.session.votes).length < alive.length) return

    const jas: number = Object.values(this.session.votes).filter((v: boolean) => v).length
    const passed: boolean = jas > alive.length / 2
    this.session.passed = passed

    if (passed) {
      this.state.termLimits = {
        presidentId: this.session.presidentId,
        chancellorId: this.session.chancellorId,
      }
      const chancellor: Player = findPlayer(
        this.state,
        this.session.chancellorId as string,
      ) as Player
      if (
        chancellor.role === "hitler" &&
        this.state.board.fascist >= HITLER_CHANCELLOR_FASCIST_POLICIES
      ) {
        this.endGame("fascist", "hitlerElected")
        return
      }
      this.pause("voteResult", { kind: "beginLegislativeSession" })
      return
    }

    // The election tracker only resets when a policy is enacted, so a passed vote leaves it
    this.state.electionTracker++
    this.pause(
      "voteResult",
      this.state.electionTracker >= ELECTION_TRACKER_LIMIT
        ? { kind: "frustratedPopulace" }
        : { kind: "nextElection" },
    )
  }

  private presidentDiscard(by: string, policy: Policy): void {
    this.expectPhase("presidentDiscard")
    this.expectPresident(by)
    const hand: Policy[] = this.session.presidentPolicies ?? []
    const index: number = hand.indexOf(policy)
    if (index < 0) fail("invalidAction", "The President doesn't hold this policy")

    const passed: Policy[] = [...hand]
    passed.splice(index, 1)
    this.state.discardPile[policy]++
    this.session.chancellorPolicies = passed
    this.state.phase = { name: "chancellorDiscard" }
  }

  private chancellorDiscard(by: string, policy: Policy): void {
    this.expectPhase("chancellorDiscard")
    this.expectChancellor(by)
    const hand: Policy[] = this.session.chancellorPolicies ?? []
    const index: number = hand.indexOf(policy)
    if (index < 0) fail("invalidAction", "The Chancellor doesn't hold this policy")

    const enacted: Policy = hand[1 - index]
    this.state.discardPile[policy]++
    this.session.enactedPolicy = enacted
    this.state.board[enacted]++
    this.state.electionTracker = 0
    // End of the legislative session: reshuffle now, after both discards, so that a policy
    // peek right after this enactment sees 3 policies
    this.reshuffleIfNeeded()

    const power: Power | undefined =
      enacted === "fascist" ? this.state.powers[this.state.board.fascist] : undefined
    if (power !== undefined) {
      this.state.phase = { name: "power", power, used: false, done: false }
      return
    }
    if (this.endGameIfBoardWins()) return
    this.pause("policyEnacted", { kind: "nextElection" })
  }

  private proposeVeto(by: string): void {
    this.expectPhase("chancellorDiscard")
    this.expectChancellor(by)
    if (!canProposeVeto(this.state)) {
      fail("wrongPhase", "A veto needs 5 fascist policies, and can't follow a refused veto")
    }
    this.state.phase = { name: "vetoRequested" }
  }

  private answerVeto(by: string, accept: boolean): void {
    this.expectPhase("vetoRequested")
    this.expectPresident(by)

    if (!accept) {
      this.session.vetoRefused = true
      this.state.phase = { name: "chancellorDiscard" }
      return
    }

    for (const policy of this.session.chancellorPolicies ?? []) {
      this.state.discardPile[policy]++
    }
    this.state.electionTracker++
    this.reshuffleIfNeeded()
    this.pause(
      "vetoAccepted",
      this.state.electionTracker >= ELECTION_TRACKER_LIMIT
        ? { kind: "frustratedPopulace" }
        : { kind: "nextElection" },
    )
  }

  private usePower(by: string, targetId: string | undefined): void {
    this.expectPhase("power")
    this.expectPresident(by)
    const phase: Extract<GameState["phase"], { name: "power" }> = this.state.phase as Extract<
      GameState["phase"],
      { name: "power" }
    >
    if (phase.used || phase.done) fail("wrongPhase", "The power was already used")

    if (phase.power === "policyPeek") {
      this.session.peekedPolicies = this.state.drawPile.slice(0, 3)
      phase.used = true
      return
    }

    if (targetId === undefined) fail("invalidAction", "This power needs a target")
    if (!isValidPowerTarget(this.state, phase.power, targetId)) {
      fail("ineligible", "This player can't be targeted")
    }
    const target: Player = findPlayer(this.state, targetId) as Player

    switch (phase.power) {
      case "investigateLoyalty":
        target.wasInvestigated = true
        this.session.investigatedId = targetId
        phase.used = true
        return
      case "callSpecialElection":
        this.session.specialElectionPresidentId = targetId
        phase.done = true
        this.state.next = { kind: "nextElection" }
        return
      case "execution":
        target.isAlive = false
        this.session.executedId = targetId
        phase.done = true
        if (target.role === "hitler") {
          this.endGame("liberal", "hitlerExecuted")
          return
        }
        this.state.next = { kind: "nextElection" }
        return
    }
  }

  private endPower(by: string): void {
    this.expectPhase("power")
    this.expectPresident(by)
    const phase: Extract<GameState["phase"], { name: "power" }> = this.state.phase as Extract<
      GameState["phase"],
      { name: "power" }
    >
    if (!phase.used || phase.done) fail("wrongPhase", "There is no power result to close")
    phase.done = true
    this.state.next = { kind: "nextElection" }
  }

  private continue(): void {
    const next: GameState["next"] = this.state.next
    if (next === undefined) fail("wrongPhase", "The game isn't paused")
    this.state.next = undefined

    switch (next.kind) {
      case "finishSetup":
        this.state.phase = { name: "nomination" }
        return
      case "beginLegislativeSession":
        // The pile is reshuffled at the end of each session, so this is only a safety net
        this.reshuffleIfNeeded()
        this.session.presidentPolicies = this.state.drawPile.splice(0, 3)
        this.state.phase = { name: "presidentDiscard" }
        return
      case "frustratedPopulace":
        return this.enactByFrustratedPopulace()
      case "nextElection":
        return this.startNextElection(true)
    }
  }

  private enactByFrustratedPopulace(): void {
    this.reshuffleIfNeeded()
    const policy: Policy = this.state.drawPile.shift() as Policy
    this.state.board[policy]++
    this.state.electionTracker = 0
    // Chaos makes everyone eligible again
    this.state.termLimits = {}
    // History order: the government that caused the chaos, then the chaos enactment
    this.state.history.push(this.session, { chaos: true, enactedPolicy: policy })
    this.reshuffleIfNeeded()
    // The policy's power, if any, is ignored
    if (this.endGameIfBoardWins(false)) return
    this.startNextElection(false)
  }

  private startNextElection(archiveSession: boolean): void {
    const special: string | undefined = this.session.specialElectionPresidentId
    if (archiveSession) this.state.history.push(this.session)

    const presidentId: string = special ?? this.nextPresidentId()
    if (special === undefined) {
      this.state.rotationPresidentId = presidentId
    }
    this.state.session = { presidentId, isSpecialElection: special !== undefined, votes: {} }
    this.state.phase = { name: "nomination" }
  }

  /** The next living player after the rotation's last President. */
  private nextPresidentId(): string {
    const players: Player[] = this.state.players
    const from: number = players.findIndex((p: Player) => p.id === this.state.rotationPresidentId)
    for (let step: number = 1; step <= players.length; step++) {
      const candidate: Player = players[(from + step) % players.length]
      if (candidate.isAlive) return candidate.id
    }
    throw new Error("No living player left")
  }

  /** Official rule: fewer than 3 policies left, shuffle them with the discards. */
  private reshuffleIfNeeded(): void {
    if (this.state.drawPile.length >= MIN_DRAW_PILE) return
    const { liberal, fascist } = this.state.discardPile
    this.state.drawPile = shuffle(
      [
        ...this.state.drawPile,
        ...Array<Policy>(liberal).fill("liberal"),
        ...Array<Policy>(fascist).fill("fascist"),
      ],
      this.rng,
    )
    this.state.discardPile = { liberal: 0, fascist: 0 }
  }

  private endGameIfBoardWins(archiveSession: boolean = true): boolean {
    if (this.state.board.liberal >= LIBERAL_POLICIES_TO_WIN) {
      this.endGame("liberal", "liberalPolicies", archiveSession)
      return true
    }
    if (this.state.board.fascist >= FASCIST_POLICIES_TO_WIN) {
      this.endGame("fascist", "fascistPolicies", archiveSession)
      return true
    }
    return false
  }

  private pause(phase: "voteResult" | "vetoAccepted" | "policyEnacted", next: GameState["next"]) {
    this.state.phase = { name: phase }
    this.state.next = next
  }

  private endGame(winner: Team, reason: WinReason, archiveSession: boolean = true): void {
    if (archiveSession && this.state.session !== undefined) {
      this.state.history.push(this.state.session)
    }
    this.state.session = undefined
    this.state.next = undefined
    this.state.phase = { name: "gameOver", winner, reason }
  }
}
