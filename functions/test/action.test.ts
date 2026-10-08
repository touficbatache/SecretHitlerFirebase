/**
 * POST /action: one endpoint for every move, with error codes clients can act on, and retries
 * that are safe.
 */
import * as assert from "node:assert/strict"
import { test } from "node:test"

import {
  act,
  advanceWhenDue,
  api,
  ApiResult,
  game,
  getGame,
  newGame,
  putGame,
  receiptsOf,
} from "./helpers"

const nominating: (overrides?: Record<string, unknown>) => Record<string, unknown> = (
  overrides: Record<string, unknown> = {},
) =>
  game({
    status: "election",
    subStatus: "election_presidentChoosingChancellor",
    currentSession: { presidentId: "randId1" },
    policies: { drawPile: "liberal,liberal,liberal", board: { liberal: 0, fascist: 0 } },
    ...overrides,
  })

const voting: (votes?: Record<string, boolean>) => Record<string, unknown> = (
  votes: Record<string, boolean> = {},
) =>
  game(
    {
      status: "election",
      subStatus: "election_voting",
      currentSession: { presidentId: "randId1", chancellorId: "randId3", votes },
      policies: { drawPile: "liberal,liberal,liberal,liberal", board: { liberal: 0, fascist: 0 } },
    },
    5,
  )

test("a move plays through /action and responds with the game code", async () => {
  const code: string = "940001"
  await putGame(code, nominating())
  const res: ApiResult = await act(
    code,
    { type: "nominate", chancellorId: "randId3" },
    { as: "randId1" },
  )
  assert.equal(res.status, 200, res.body)
  assert.deepEqual(JSON.parse(res.body), { code })
  assert.equal((await getGame(code)).currentSession.chancellorId, "randId3")
})

test("errors say what went wrong with a code and a standard status", async () => {
  const code: string = "940002"
  await putGame(code, nominating())

  const notYourTurn: ApiResult = await act(
    code,
    { type: "nominate", chancellorId: "randId3" },
    { as: "randId2" },
  )
  assert.equal(notYourTurn.status, 403)
  assert.deepEqual(Object.keys(JSON.parse(notYourTurn.body).error).sort(), ["code", "message"])
  assert.equal(notYourTurn.error, "NOT_YOUR_TURN")

  const stranger: ApiResult = await act(
    code,
    { type: "nominate", chancellorId: "randId3" },
    { as: "mallory" },
  )
  assert.deepEqual([stranger.status, stranger.error], [403, "NOT_IN_GAME"])

  const ineligible: ApiResult = await act(
    code,
    { type: "nominate", chancellorId: "randId1" },
    { as: "randId1" },
  )
  assert.deepEqual([ineligible.status, ineligible.error], [422, "INELIGIBLE"])

  const wrongPhase: ApiResult = await act(code, { type: "vote", ja: true }, { as: "randId2" })
  assert.deepEqual([wrongPhase.status, wrongPhase.error], [409, "WRONG_PHASE"])

  const missing: ApiResult = await act("999999", { type: "vote", ja: true })
  assert.deepEqual([missing.status, missing.error], [404, "GAME_NOT_FOUND"])

  assert.equal((await getGame(code)).currentSession.chancellorId, undefined, "nothing changed")
})

test("malformed requests are rejected before the game is touched", async () => {
  const code: string = "940003"
  await putGame(code, nominating())
  const malformed: Record<string, unknown>[] = [
    {},
    { action: "nominate" },
    { action: { type: "nominate" } },
    { action: { type: "nominate", chancellorId: 3 } },
    { action: { type: "vote", ja: "yes" } },
    { action: { type: "discard", policy: "communist" } },
    { action: { type: "usePower", targetId: 4 } },
    // Only the server moves the game on after a pause
    { action: { type: "continue" } },
    { action: { type: "nominate", chancellorId: "randId3" }, actionId: "" },
    { action: { type: "nominate", chancellorId: "randId3" }, actionId: "../../games" },
    { action: { type: "nominate", chancellorId: "randId3" }, actionId: 42 },
  ]
  for (const body of malformed) {
    const res: ApiResult = await api("action", { code, ...body }, { as: "randId1" })
    assert.deepEqual([res.status, res.error], [400, "INVALID_REQUEST"], JSON.stringify(body))
  }
  assert.equal((await api("action", { action: { type: "proposeVeto" } })).error, "INVALID_REQUEST")
  assert.equal((await getGame(code)).currentSession.chancellorId, undefined)
})

test("a move in a lobby is rejected: the game hasn't started", async () => {
  const code: string = await newGame()
  const res: ApiResult = await act(code, { type: "vote", ja: true })
  assert.deepEqual([res.status, res.error], [409, "WRONG_PHASE"])
})

test("a retried vote gets the same response and counts once", async () => {
  const code: string = "940004"
  await putGame(code, voting())
  const first: ApiResult = await act(
    code,
    { type: "vote", ja: true },
    { as: "randId2", actionId: "vote-1" },
  )
  assert.equal(first.status, 200, first.body)

  const retry: ApiResult = await act(
    code,
    { type: "vote", ja: true },
    { as: "randId2", actionId: "vote-1" },
  )
  assert.equal(retry.status, 200, retry.body)
  assert.equal(retry.body, first.body)
  assert.deepEqual((await getGame(code)).currentSession.votes, { randId2: true })

  // A new tap is a new action: the engine refuses a second vote
  const again: ApiResult = await act(
    code,
    { type: "vote", ja: false },
    { as: "randId2", actionId: "vote-2" },
  )
  assert.deepEqual([again.status, again.error], [403, "NOT_YOUR_TURN"])
  assert.deepEqual((await getGame(code)).currentSession.votes, { randId2: true })
})

test("retrying the last vote succeeds even though the votes are now showing", async () => {
  const code: string = "940005"
  await putGame(code, voting({ randId0: true, randId1: true, randId2: true, randId3: true }))
  const last: ApiResult = await act(
    code,
    { type: "vote", ja: true },
    { as: "randId4", actionId: "last-vote" },
  )
  assert.equal(last.status, 200, last.body)
  assert.notEqual((await getGame(code)).pendingTransition, undefined, "the votes are showing")

  const retry: ApiResult = await act(
    code,
    { type: "vote", ja: true },
    { as: "randId4", actionId: "last-vote" },
  )
  assert.equal(retry.status, 200, retry.body)

  // Without the id, the same request is a move during the pause
  const untracked: ApiResult = await act(code, { type: "vote", ja: true }, { as: "randId4" })
  assert.equal(untracked.error, "PAUSED")
})

test("a retried policy peek shows the same policies, and receipts are kept per player", async () => {
  const code: string = "940006"
  await putGame(
    code,
    game(
      {
        status: "presidentialPower",
        subStatus: "presidentialPower_policyPeek",
        currentSession: { presidentId: "randId1", chancellorId: "randId3" },
        policies: {
          drawPile: "fascist,liberal,fascist,liberal",
          board: { liberal: 0, fascist: 3 },
        },
      },
      5,
    ),
  )
  const peek: ApiResult = await act(code, { type: "usePower" }, { as: "randId1", actionId: "peek" })
  assert.equal(peek.status, 200, peek.body)
  assert.equal(JSON.parse(peek.body).policies, "fascist,liberal,fascist")

  const retry: ApiResult = await act(
    code,
    { type: "usePower" },
    { as: "randId1", actionId: "peek" },
  )
  assert.equal(retry.body, peek.body)

  const receipts: any = await receiptsOf(code)
  assert.deepEqual(Object.keys(receipts), ["randId1"])
  assert.equal(receipts.randId1.id, "peek")
})

test("the routes from before /action still work, with the new errors", async () => {
  const code: string = "940007"
  await putGame(code, nominating())
  const routes: [string, Record<string, unknown>][] = [
    ["chooseChancellor", { chancellorId: "randId3" }],
    ...Array.from({ length: 7 }, (): [string, Record<string, unknown>] => ["vote", { vote: true }]),
  ]
  for (const [path, body] of routes) {
    const res: ApiResult = await api(path, { code, ...body })
    assert.equal(res.status, 200, `${path}: ${res.body}`)
  }
  await advanceWhenDue(code)

  const wrongDiscard: ApiResult = await api("chancellorDiscardPolicy", { code, policy: "liberal" })
  assert.deepEqual([wrongDiscard.status, wrongDiscard.error], [409, "WRONG_PHASE"])
  assert.equal((await api("presidentDiscardPolicy", { code, policy: "liberal" })).status, 200)
  assert.equal((await api("chancellorDiscardPolicy", { code, policy: "liberal" })).status, 200)
  assert.equal((await getGame(code)).policies.board.liberal, 1)

  const invalid: ApiResult = await api("answerVeto", { code })
  assert.deepEqual([invalid.status, invalid.error], [400, "INVALID_REQUEST"])
})
