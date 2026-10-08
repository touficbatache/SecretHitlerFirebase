/** Requests on the same game run one at a time, so racing clients can't corrupt it. */
import * as assert from "node:assert/strict"
import { test } from "node:test"

import {
  advanceWhenDue,
  api,
  ApiResult,
  cards,
  game,
  getGame,
  lockOf,
  putGame,
  sleep,
  write,
} from "./helpers"

const statuses: (results: ApiResult[]) => number[] = (results: ApiResult[]) =>
  results.map((result: ApiResult) => result.status).sort()

test("7 simultaneous votes, then 7 simultaneous /advance: one session, 3 cards drawn once", async () => {
  const code: string = "920001"
  await putGame(
    code,
    game({
      status: "election",
      subStatus: "election_voting",
      currentSession: { presidentId: "randId1", chancellorId: "randId3" },
      policies: {
        drawPile: "liberal,liberal,fascist,fascist,liberal,fascist,fascist,fascist,liberal",
        board: { liberal: 0, fascist: 0 },
      },
    }),
  )
  const results: ApiResult[] = await Promise.all(
    Array.from({ length: 7 }, () => api("vote", { code, vote: true })),
  )
  assert.deepEqual(statuses(results), Array(7).fill(200))
  const results7: any = await getGame(code)
  assert.equal(Object.keys(results7.currentSession.votes).length, 7, "7 distinct votes")

  // Every client asks to move on as soon as the votes have been shown
  await sleep(results7.pendingTransition.at - Date.now() + 50)
  const advances: ApiResult[] = await Promise.all(
    Array.from({ length: 7 }, () => api("advance", { code })),
  )
  assert.deepEqual(statuses(advances), Array(7).fill(200))
  const after: any = await getGame(code)
  assert.equal(after.subStatus, "legislativeSession_presidentDiscardingPolicy")
  assert.equal(cards(after.currentSession.presidentPolicies).length, 3, "the President holds 3")
  assert.equal(cards(after.policies.drawPile).length, 6, "9 - 3 left in the pile")
})

test("a player who double-taps their vote only votes once", async () => {
  const code: string = "920002"
  // Dev mode gives requests the ids randId0, randId1... in order: with 5 votes already in,
  // both requests race for the 6th voter.
  await putGame(
    code,
    game(
      {
        status: "election",
        subStatus: "election_voting",
        currentSession: {
          presidentId: "randId1",
          chancellorId: "randId3",
          votes: { randId0: true, randId1: true, randId2: true, randId3: false, randId4: false },
        },
        policies: {
          drawPile: "liberal,liberal,liberal,liberal",
          board: { liberal: 0, fascist: 0 },
        },
      },
      6,
    ),
  )
  const results: ApiResult[] = await Promise.all([
    api("vote", { code, vote: true }),
    api("vote", { code, vote: true }),
  ])
  assert.deepEqual(statuses(results), [200, 457])
  assert.equal(Object.keys((await getGame(code)).currentSession.votes).length, 6)
  assert.equal(cards((await advanceWhenDue(code)).policies.drawPile).length, 1, "drew once")
})

test("4 simultaneous joins on an 8-player lobby: exactly 10 players", async () => {
  const code: string = "920003"
  await putGame(
    code,
    game({ status: "waiting", gameType: null, executiveActions: null, lastPresidentId: null }, 8),
  )
  const results: ApiResult[] = await Promise.all(
    Array.from({ length: 4 }, () => api("joinGame", { code })),
  )
  assert.equal(results.filter((result: ApiResult) => result.status === 200).length, 2)
  const ids: string[] = Object.values((await getGame(code)).players).map((p: any) => p.id)
  assert.equal(ids.length, 10)
  assert.equal(new Set(ids).size, 10, "no player added twice")
})

test("a Chancellor who double-taps a discard enacts one policy", async () => {
  const code: string = "920004"
  await putGame(
    code,
    game({
      status: "legislativeSession",
      subStatus: "legislativeSession_chancellorDiscardingPolicy",
      currentSession: {
        presidentId: "randId1",
        chancellorId: "randId3",
        presidentPolicies: "liberal,liberal,fascist",
        chancellorPolicies: "liberal,fascist",
      },
      policies: {
        drawPile: "liberal,liberal,liberal,liberal,liberal",
        discardPile: { liberal: 1 },
        board: { liberal: 0, fascist: 0 },
      },
    }),
  )
  const results: ApiResult[] = await Promise.all([
    api("chancellorDiscardPolicy", { code, policy: "fascist" }),
    api("chancellorDiscardPolicy", { code, policy: "fascist" }),
  ])
  assert.equal((await getGame(code)).policies.board.liberal, 1)
  assert.deepEqual(statuses(results), [200, 457])
})

test("a President who double-taps an execution executes one player", async () => {
  const code: string = "920005"
  await putGame(
    code,
    game({
      status: "presidentialPower",
      subStatus: "presidentialPower_execution",
      currentSession: { presidentId: "randId1", chancellorId: "randId3" },
      policies: { drawPile: "liberal,liberal,liberal", board: { liberal: 0, fascist: 4 } },
    }),
  )
  await Promise.all([
    api("presidentialPower", { code, player: "randId5" }),
    api("presidentialPower", { code, player: "randId6" }),
  ])
  const after: any = await advanceWhenDue(code)
  const executed: string[] = Object.values(after.players)
    .filter((p: any) => p.isExecuted)
    .map((p: any) => p.id)
  assert.equal(executed.length, 1, `executed: ${executed}`)
  assert.equal(Object.values(after.sessions ?? {}).length, 1, "one session archived")
})

test("the lock is released after each request, including failed ones", async () => {
  assert.equal(await lockOf("920001"), null, "after the votes")
  assert.equal(await lockOf("920003"), null, "after rejected joins")
  assert.equal((await api("vote", { code: "999999", vote: true })).status, 452)
  assert.equal(await lockOf("999999"), null, "for a game that doesn't exist")
})

test("an action sent while the votes are shown is rejected right away", async () => {
  const code: string = "920007"
  await putGame(
    code,
    game(
      {
        status: "election",
        subStatus: "election_voting",
        currentSession: {
          presidentId: "randId1",
          chancellorId: "randId3",
          votes: { randId0: true, randId1: true, randId2: true, randId3: true },
        },
        policies: {
          drawPile: "liberal,liberal,liberal,liberal",
          board: { liberal: 0, fascist: 0 },
        },
      },
      5,
    ),
  )
  assert.equal((await api("vote", { code, vote: true })).status, 200)
  const early: ApiResult = await api("presidentDiscardPolicy", { code, policy: "liberal" })
  assert.equal(early.status, 457, early.body)
  assert.ok(early.ms < 2000, `the rejection took ${early.ms}ms`)
  assert.equal(
    (await advanceWhenDue(code)).subStatus,
    "legislativeSession_presidentDiscardingPolicy",
  )
})

test("a lock left by a crashed request expires after 10 seconds, and waiting requests go on", async () => {
  const code: string = "920008"
  await putGame(code, game({ status: "waiting" }, 5))
  await write(`gameLocks/${code}`, { token: "crashed-request", expiresAt: Date.now() + 10_000 })
  const res: ApiResult = await api("setGameVisibility", { code, visibility: "public" })
  assert.equal(res.status, 200, res.body)
  assert.ok(res.ms > 7_500 && res.ms < 14_000, `waited ${res.ms}ms`)
})
