import * as assert from "node:assert/strict"

import {
  Action,
  apply,
  ApplyResult,
  GameState,
  Player,
  Policy,
  PolicyCounts,
  Role,
  RuleErrorCode,
  seededRng,
  setupGame,
} from "../../src/engine"

export const ids: (count: number) => string[] = (count: number) =>
  Array.from({ length: count }, (_: unknown, i: number) => `p${i}`)

/** p0 is Hitler, then the fascists, then the liberals. */
export function defaultRoles(count: number): Role[] {
  const fascists: number = count <= 6 ? 1 : count <= 8 ? 2 : 3
  return ids(count).map(
    (_: string, i: number): Role => (i === 0 ? "hitler" : i <= fascists ? "fascist" : "liberal"),
  )
}

export interface Scenario {
  players?: number
  roles?: Role[]
  /** Top first. */
  drawPile?: Policy[]
  discardPile?: PolicyCounts
  board?: PolicyCounts
  electionTracker?: number
  president?: string
  termLimits?: { presidentId?: string; chancellorId?: string }
  dead?: string[]
  /** Stay in the intro instead of moving on to the first nomination. */
  inIntro?: boolean
}

/** A game set up the way a test needs, at the first nomination. */
export function game(scenario: Scenario = {}): GameState {
  const count: number = scenario.players ?? scenario.roles?.length ?? 7
  const state: GameState = setupGame(ids(count), seededRng(1))
  const roles: Role[] = scenario.roles ?? defaultRoles(count)
  state.players.forEach((player: Player, i: number) => {
    player.role = roles[i]
    player.isAlive = !(scenario.dead ?? []).includes(player.id)
  })
  if (scenario.drawPile !== undefined) state.drawPile = [...scenario.drawPile]
  if (scenario.discardPile !== undefined) state.discardPile = { ...scenario.discardPile }
  if (scenario.board !== undefined) state.board = { ...scenario.board }
  if (scenario.electionTracker !== undefined) state.electionTracker = scenario.electionTracker
  if (scenario.termLimits !== undefined) state.termLimits = { ...scenario.termLimits }
  const president: string = scenario.president ?? "p1"
  state.rotationPresidentId = president
  state.session = { presidentId: president, isSpecialElection: false, votes: {} }
  return scenario.inIntro === true ? state : must(state, { type: "continue" })
}

/** Applies an action that must be allowed. */
export function must(state: GameState, action: Action): GameState {
  const result: ApplyResult = apply(state, action, seededRng(7))
  if (result.error !== undefined) {
    assert.fail(
      `${JSON.stringify(action)} was rejected: ${result.error.code}, ${result.error.message}`,
    )
  }
  return result.state as GameState
}

/** Applies actions that must all be allowed. */
export function play(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce(must, state)
}

/** Applies an action that must be rejected, and returns why. */
export function rejected(state: GameState, action: Action): RuleErrorCode {
  const result: ApplyResult = apply(state, action, seededRng(7))
  if (result.error === undefined) assert.fail(`${JSON.stringify(action)} was allowed`)
  return result.error.code
}

export function president(state: GameState): string {
  return (state.session as NonNullable<GameState["session"]>).presidentId
}

/** Every living player votes the same way. */
export function voteAll(state: GameState, ja: boolean): GameState {
  return state.players
    .filter((p: Player) => p.isAlive)
    .reduce((s: GameState, p: Player) => must(s, { type: "vote", by: p.id, ja }), state)
}

/** The President nominates `chancellorId`, and everyone votes `ja`. */
export function elect(state: GameState, chancellorId: string, ja: boolean = true): GameState {
  return voteAll(must(state, { type: "nominate", by: president(state), chancellorId }), ja)
}

/**
 * A whole government: elected, then the President and the Chancellor discard so that `enacted`
 * is enacted. The drawn policies must allow it.
 */
export function enact(state: GameState, chancellorId: string, enacted: Policy): GameState {
  let s: GameState = must(elect(state, chancellorId), { type: "continue" })
  const drawn: Policy[] = s.session?.presidentPolicies ?? []
  const presidentDiscard: Policy =
    drawn.filter((p: Policy) => p !== enacted).length > 0
      ? (drawn.find((p: Policy) => p !== enacted) as Policy)
      : enacted
  s = must(s, { type: "discard", by: president(s), policy: presidentDiscard })
  const hand: Policy[] = s.session?.chancellorPolicies ?? []
  assert.ok(hand.includes(enacted), `the Chancellor can't enact ${enacted} from ${hand}`)
  const chancellorDiscard: Policy = hand[hand.indexOf(enacted) === 0 ? 1 : 0]
  return must(s, { type: "discard", by: chancellorId, policy: chancellorDiscard })
}

/** Cards outside the draw pile, the discard pile and the board: the ones in someone's hand. */
export function cardsInHand(state: GameState): number {
  switch (state.phase.name) {
    case "presidentDiscard":
      return state.session?.presidentPolicies?.length ?? 0
    case "chancellorDiscard":
    case "vetoRequested":
      return state.session?.chancellorPolicies?.length ?? 0
    default:
      return 0
  }
}

export function totalCards(state: GameState): number {
  return (
    state.drawPile.length +
    state.discardPile.liberal +
    state.discardPile.fascist +
    state.board.liberal +
    state.board.fascist +
    cardsInHand(state)
  )
}
