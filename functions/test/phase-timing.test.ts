/**
 * The pauses between phases run on the server clock: each request responds right away and writes
 * the next phase as a pending transition, applied once its time has come.
 */
import * as assert from "node:assert/strict"
import { test } from "node:test"

import {
  advanceWhenDue,
  api,
  ApiResult,
  cards,
  game,
  getGame,
  newGame,
  putGame,
  sleep,
} from "./helpers"

const votingGame: (overrides?: Record<string, unknown>) => Record<string, unknown> = (
  overrides: Record<string, unknown> = {},
) =>
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
        drawPile: "liberal,liberal,liberal,liberal,liberal",
        board: { liberal: 0, fascist: 0 },
      },
      ...overrides,
    },
    5,
  )

test("startGame responds right away, and the intro ends 5 seconds after it started", async () => {
  const code: string = await newGame()
  for (let i: number = 0; i < 4; i++) await api("joinGame", { code })

  const start: ApiResult = await api("startGame", {
    code,
    hidePicsGameInfo: false,
    skipLongIntro: true,
  })
  assert.equal(start.status, 200, start.body)
  assert.ok(start.ms < 3000, `startGame took ${start.ms}ms`)

  const intro: any = await getGame(code)
  assert.equal(intro.status, "settingUp")
  assert.equal(intro.pendingTransition.kind, "finishSetup")
  assert.equal(intro.pendingTransition.at - intro.startedAt, 5000, "the intro lasts 5s")

  const early: ApiResult = await api("advance", { code })
  assert.equal(early.status, 200)
  assert.equal(JSON.parse(early.body).pendingTransitionAt, intro.pendingTransition.at)
  assert.equal((await getGame(code)).status, "settingUp", "an early /advance changes nothing")

  const started: any = await advanceWhenDue(code)
  assert.equal(started.subStatus, "election_presidentChoosingChancellor")
  assert.ok(Date.now() >= intro.pendingTransition.at)
})

test("the last vote responds right away, and the votes stay up for 5 seconds", async () => {
  const code: string = "910001"
  await putGame(code, votingGame())

  const lastVote: ApiResult = await api("vote", { code, vote: true })
  assert.equal(lastVote.status, 200, lastVote.body)
  assert.ok(lastVote.ms < 3000, `the last vote took ${lastVote.ms}ms`)

  const results: any = await getGame(code)
  assert.equal(results.subStatus, "election_votingEnded")
  assert.equal(results.pendingTransition.kind, "beginLegislativeSession")
  const pause: number = results.pendingTransition.at - Date.now()
  assert.ok(pause > 3000 && pause <= 5000, `${pause}ms of pause left`)

  const early: ApiResult = await api("presidentDiscardPolicy", { code, policy: "liberal" })
  assert.equal(early.status, 457, "an action during the pause is rejected")
  assert.ok(early.ms < 2000, `the rejection took ${early.ms}ms`)

  const legislative: any = await advanceWhenDue(code)
  assert.equal(legislative.subStatus, "legislativeSession_presidentDiscardingPolicy")
  assert.equal(cards(legislative.currentSession.presidentPolicies).length, 3)
})

test("a transition that is due is applied by the next request, even without /advance", async () => {
  const code: string = "910002"
  await putGame(code, votingGame())
  await api("vote", { code, vote: true })
  const results: any = await getGame(code)
  await sleep(results.pendingTransition.at - Date.now() + 200)

  const discard: ApiResult = await api("presidentDiscardPolicy", { code, policy: "liberal" })
  assert.equal(discard.status, 200, discard.body)
  assert.equal(
    (await getGame(code)).subStatus,
    "legislativeSession_chancellorDiscardingPolicy",
    "the session began, then the President discarded",
  )
})

test("a third failed government: chaos after the pause, then the next election", async () => {
  const code: string = "910003"
  await putGame(
    code,
    votingGame({
      electionTracker: 2,
      currentSession: { presidentId: "randId1", chancellorId: "randId2" },
    }),
  )
  for (let i: number = 0; i < 5; i++) await api("vote", { code, vote: false })

  const results: any = await getGame(code)
  assert.equal(results.pendingTransition.kind, "frustratedPopulace")
  assert.equal(results.policies.board.liberal, 0, "nothing enacted while the votes show")

  const next: any = await advanceWhenDue(code)
  assert.equal(next.policies.board.liberal, 1)
  assert.equal(next.subStatus, "election_presidentChoosingChancellor")
})

test("after an enactment without a power, the next election starts after the pause", async () => {
  const code: string = "910004"
  await putGame(
    code,
    game(
      {
        status: "legislativeSession",
        subStatus: "legislativeSession_chancellorDiscardingPolicy",
        currentSession: {
          presidentId: "randId1",
          chancellorId: "randId3",
          presidentPolicies: "liberal,liberal,fascist",
          chancellorPolicies: "liberal,fascist",
        },
        policies: { drawPile: "liberal,liberal,liberal", board: { liberal: 0, fascist: 0 } },
      },
      5,
    ),
  )
  assert.equal((await api("chancellorDiscardPolicy", { code, policy: "fascist" })).status, 200)
  const enacted: any = await getGame(code)
  assert.equal(enacted.subStatus, "legislativeSession_sessionEndedWithPolicyEnactment")
  assert.equal(enacted.pendingTransition.kind, "nextElection")

  const next: any = await advanceWhenDue(code)
  assert.equal(next.subStatus, "election_presidentChoosingChancellor")
  assert.equal(next.currentSession.presidentId, "randId2", "the next President in order")
})

test("a special election makes the chosen player President after the pause", async () => {
  const code: string = "910005"
  await putGame(
    code,
    game({
      status: "presidentialPower",
      subStatus: "presidentialPower_callSpecialElection",
      currentSession: { presidentId: "randId1", chancellorId: "randId3" },
      policies: { drawPile: "liberal,liberal,liberal", board: { liberal: 0, fascist: 3 } },
    }),
  )
  assert.equal((await api("presidentialPower", { code, player: "randId5" })).status, 200)
  assert.equal((await getGame(code)).pendingTransition.specialElectionPresidentId, "randId5")

  const next: any = await advanceWhenDue(code)
  assert.equal(next.currentSession.presidentId, "randId5")
  assert.equal(next.currentSession.isSpecialElection, true)
})

test("a game that ends leaves no transition pending", async () => {
  const code: string = "910006"
  // Hitler (randId0) elected Chancellor with 3 fascist policies on the board
  await putGame(
    code,
    votingGame({
      currentSession: {
        presidentId: "randId1",
        chancellorId: "randId0",
        votes: { randId0: true, randId1: true, randId2: true, randId3: true },
      },
      policies: { drawPile: "liberal,liberal,liberal", board: { liberal: 0, fascist: 3 } },
    }),
  )
  await api("vote", { code, vote: true })
  const ended: any = await getGame(code)
  assert.equal(ended.subStatus, "gameEnded_fascist")
  assert.equal(ended.pendingTransition, undefined)
})
