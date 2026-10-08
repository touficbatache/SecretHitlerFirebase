/**
 * Thousands of complete games with random legal moves, checking after every move that the game
 * stays consistent. This is how an AI or a bot would drive the engine.
 */
import * as assert from "node:assert/strict"
import { test } from "node:test"

import {
  Action,
  apply,
  ApplyResult,
  GameState,
  legalActions,
  Player,
  Rng,
  seededRng,
  setupGame,
  WinReason,
} from "../../src/engine"

import { ids, totalCards } from "./helpers"

const GAMES_PER_SIZE: number = 300
const MAX_MOVES: number = 1000

interface Played {
  final: GameState
  moves: number
}

/** Plays a whole game, picking among the legal moves at random. */
function playRandomGame(players: number, seed: number, checkEveryLegalMove: boolean): Played {
  const engineRng: Rng = seededRng(seed)
  const choices: Rng = seededRng(seed * 7919)
  let state: GameState = setupGame(ids(players), engineRng)

  for (let moves: number = 0; moves < MAX_MOVES; moves++) {
    checkInvariants(state, `${players} players, seed ${seed}, move ${moves}`)
    if (state.phase.name === "gameOver") return { final: state, moves }

    const legal: Action[] = legalActions(state)
    assert.ok(legal.length > 0, `stuck in ${state.phase.name} (seed ${seed})`)

    if (checkEveryLegalMove) {
      for (const action of legal) {
        const result: ApplyResult = apply(state, action, seededRng(seed))
        assert.ok(result.ok, `legal ${JSON.stringify(action)} rejected: ${result.error?.message}`)
      }
    }

    const action: Action = legal[Math.floor(choices() * legal.length)]
    const result: ApplyResult = apply(state, action, engineRng)
    assert.ok(result.ok, `${JSON.stringify(action)} rejected: ${result.error?.message}`)
    state = result.state as GameState
  }
  assert.fail(`${players} players, seed ${seed}: no winner after ${MAX_MOVES} moves`)
}

function checkInvariants(state: GameState, where: string): void {
  assert.equal(totalCards(state), 17, `${where}: policies lost or duplicated`)
  assert.ok(state.board.liberal <= 5 && state.board.fascist <= 6, `${where}: board overflow`)
  assert.equal(
    state.players.filter((p: Player) => p.role === "hitler").length,
    1,
    `${where}: one Hitler`,
  )

  const tracker: number = state.electionTracker
  assert.ok(tracker >= 0 && tracker <= 3, `${where}: tracker ${tracker}`)
  if (tracker === 3) {
    assert.deepEqual(state.next, { kind: "frustratedPopulace" }, `${where}: tracker at 3`)
  }

  if (state.phase.name === "nomination") {
    // The reshuffle rule: a new government can always draw 3 policies
    assert.ok(state.drawPile.length >= 3, `${where}: only ${state.drawPile.length} policies left`)
    const president: Player | undefined = state.players.find(
      (p: Player) => p.id === state.session?.presidentId,
    )
    assert.ok(president?.isAlive, `${where}: the President is dead`)
  }

  if (state.phase.name === "gameOver") {
    const { reason } = state.phase
    const hitler: Player = state.players.find((p: Player) => p.role === "hitler") as Player
    const wins: Record<WinReason, boolean> = {
      liberalPolicies: state.board.liberal === 5,
      fascistPolicies: state.board.fascist === 6,
      hitlerElected: state.board.fascist >= 3,
      hitlerExecuted: !hitler.isAlive,
    }
    assert.ok(wins[reason], `${where}: game over by ${reason} without its condition`)
    assert.equal(state.session, undefined)
  } else {
    assert.ok(
      state.board.liberal < 5 && state.board.fascist < 6,
      `${where}: a winning board but the game goes on`,
    )
  }
}

test(`${GAMES_PER_SIZE} random games for each player count end consistently`, () => {
  const reasons: Record<string, number> = {}
  let longest: number = 0
  for (let players: number = 5; players <= 10; players++) {
    for (let seed: number = 1; seed <= GAMES_PER_SIZE; seed++) {
      const { final, moves } = playRandomGame(players, seed * 100 + players, seed <= 10)
      if (final.phase.name === "gameOver") {
        reasons[final.phase.reason] = (reasons[final.phase.reason] ?? 0) + 1
      }
      longest = Math.max(longest, moves)
    }
  }
  // Every way to win happens, so every path through the rules was taken
  assert.deepEqual(Object.keys(reasons).sort(), [
    "fascistPolicies",
    "hitlerElected",
    "hitlerExecuted",
    "liberalPolicies",
  ])
  assert.ok(longest < MAX_MOVES)
})

test("a game replays identically from its seed and moves", () => {
  for (const players of [5, 7, 10]) {
    const first: GameState = playRandomGame(players, 1234, false).final
    const second: GameState = playRandomGame(players, 1234, false).final
    assert.deepEqual(first, second)
  }
})
