/**
 * The adapter between the database and the rules engine. Runs without the emulators, with
 * npm run test:engine.
 */
import * as assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import {
  Action,
  apply,
  ApplyResult,
  GameState,
  legalActions,
  Rng,
  seededRng,
  setupGame,
} from "../../src/engine"
import { databaseUpdates, toDatabase, toEngineState } from "../../src/engine-adapter"
import { decodeGameData } from "../../src/handlers/game-data-handler"

interface Recorded {
  scenario: string
  after: string
  game: any
}

/** Game states the controller wrote before it used the engine, from its own emulator scenarios. */
const RECORDED: Recorded[] = JSON.parse(
  readFileSync(join(__dirname, "../../../test/unit/recorded-games.json"), "utf8"),
)

const RULE_FIELDS: string[] = [
  "players",
  "executiveActions",
  "policies",
  "electionTracker",
  "lastPresidentId",
  "lastSuccessfulPresidentId",
  "lastSuccessfulChancellorId",
  "currentSession",
  "sessions",
  "status",
  "subStatus",
  "presidentialPower",
  "specialElectionPlayer",
]

/**
 * What Firebase stores and the app reads: arrays are index-keyed objects, nulls and empty objects
 * don't exist, and a zero count or isSpecialElection: false reads the same as a missing one.
 */
function stored(value: unknown, key: string = ""): unknown {
  let v: unknown = value
  if (Array.isArray(v)) v = Object.fromEntries(v.map((x: unknown, i: number) => [String(i), x]))
  if (v === null || v === undefined) return undefined
  if (typeof v !== "object") {
    if ((key === "liberal" || key === "fascist") && v === 0) return undefined
    if (key === "isSpecialElection" && v === false) return undefined
    return v
  }
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    // Player names and pictures aren't the rules' business
    if (k === "name" || k === "assetReference") continue
    const y: unknown = stored(x, k)
    if (y !== undefined) out[k] = y
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function ruleFields(game: any): Record<string, unknown> {
  return Object.fromEntries(RULE_FIELDS.map((key: string) => [key, game[key]]))
}

const canonical: (value: unknown) => string = (value: unknown) =>
  JSON.stringify(value, (_: string, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a]: [string, unknown], [b]: [string, unknown]) =>
            a.localeCompare(b),
          ),
        )
      : v,
  )

const decode: (raw: unknown) => any = (raw: unknown) =>
  decodeGameData(JSON.parse(JSON.stringify(raw)))

test("every recorded game reads into the engine and writes back the same", () => {
  assert.ok(RECORDED.length > 50)
  for (const { scenario, after, game } of RECORDED) {
    const back: Record<string, unknown> = toDatabase(toEngineState(decode(game)))
    const expected: Record<string, unknown> = ruleFields(game)
    // Known difference: after Hitler's execution, the old controller left presidentialPower
    // "done" on the finished game. Nothing reads it there.
    if (game.status === "gameEnded") delete expected.presidentialPower
    assert.equal(
      canonical(stored(ruleFields(back))),
      canonical(stored(expected)),
      `${scenario}, after ${after}`,
    )
  }
})

test("every recorded game keeps the same engine state through a database round trip", () => {
  for (const { scenario, after, game } of RECORDED) {
    const state: GameState = toEngineState(decode(game))
    const again: GameState = toEngineState(
      decode({ ...toDatabase(state), pendingTransition: game.pendingTransition }),
    )
    assert.deepEqual(again, state, `${scenario}, after ${after}`)
  }
})

test("every state of random games survives a database round trip", () => {
  let states: number = 0
  for (let players: number = 5; players <= 10; players++) {
    for (let seed: number = 1; seed <= 20; seed++) {
      const rng: Rng = seededRng(seed)
      const choices: Rng = seededRng(seed * 31)
      let state: GameState = setupGame(
        Array.from({ length: players }, (_: unknown, i: number) => `p${i}`),
        rng,
      )
      while (state.phase.name !== "gameOver") {
        const stored: any = {
          ...toDatabase(state),
          pendingTransition: state.next === undefined ? undefined : { at: 0, ...state.next },
        }
        assert.deepEqual(toEngineState(decode(stored)), state, `${players} players, seed ${seed}`)
        states++
        const legal: Action[] = legalActions(state)
        const result: ApplyResult = apply(state, legal[Math.floor(choices() * legal.length)], rng)
        state = result.state as GameState
      }
    }
  }
  assert.ok(states > 1000)
})

test("a move only writes what changed, and never the fields the rules don't own", () => {
  const game: any = decode(
    RECORDED.find((r: Recorded) => r.game.subStatus === "election_voting")?.game,
  )
  const before: GameState = toEngineState(game)
  assert.deepEqual(databaseUpdates(before, before, game.settings), {}, "no change, no write")

  const voter: string = before.players.find(
    (p: { id: string }) => before.session?.votes[p.id] === undefined,
  )?.id as string
  const after: GameState = apply(before, { type: "vote", by: voter, ja: true }, seededRng(1))
    .state as GameState
  assert.deepEqual(databaseUpdates(before, after, game.settings), {
    [`currentSession/votes/${voter}`]: true,
  })
})

test("a pause is written with its end time, and cleared when it's over", () => {
  const game: any = decode(
    RECORDED.find((r: Recorded) => r.game.subStatus === "election_voting")?.game,
  )
  // Everyone votes but one
  let before: GameState = toEngineState(game)
  const voters: string[] = before.players
    .filter((p: { id: string; isAlive: boolean }) => p.isAlive)
    .map((p: { id: string }) => p.id)
    .filter((id: string) => before.session?.votes[id] === undefined)
  for (const by of voters.slice(0, -1)) {
    before = apply(before, { type: "vote", by, ja: true }, seededRng(1)).state as GameState
  }

  const after: GameState = apply(
    before,
    { type: "vote", by: voters[voters.length - 1], ja: true },
    seededRng(1),
  ).state as GameState
  const updates: Record<string, unknown> = databaseUpdates(before, after, {}, 1000)
  assert.deepEqual(updates.pendingTransition, { at: 6000, kind: "beginLegislativeSession" })
  assert.equal(updates.subStatus, "election_votingEnded")

  const next: GameState = apply(after, { type: "continue" }, seededRng(1)).state as GameState
  assert.equal(databaseUpdates(after, next, {}).pendingTransition, null)
})
