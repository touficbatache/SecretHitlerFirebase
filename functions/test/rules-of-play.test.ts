/** Game rules, played through the API: chaos, reshuffles, eligibility, veto, power targets. */
import * as assert from "node:assert/strict"
import { test } from "node:test"

import {
  act,
  advanceWhenDue,
  api,
  ApiResult,
  cards,
  game,
  getGame,
  newGame,
  putGame,
  waitForGame,
} from "./helpers"

test("chaos with 3 cards left reshuffles, and the next President still gets 3 cards", async () => {
  const code: string = "900001"
  await putGame(
    code,
    game({
      status: "election",
      subStatus: "election_voting",
      electionTracker: 2,
      lastSuccessfulPresidentId: "randId4",
      lastSuccessfulChancellorId: "randId5",
      currentSession: { presidentId: "randId1", chancellorId: "randId2" },
      policies: {
        drawPile: "liberal,fascist,fascist",
        discardPile: { liberal: 2, fascist: 4 },
        board: { liberal: 1, fascist: 2 },
      },
    }),
  )
  for (let i: number = 0; i < 7; i++) {
    const res: ApiResult = await act(code, { type: "vote", ja: false })
    assert.equal(res.status, 200, res.body)
  }
  const afterChaos: any = await waitForGame(
    code,
    (g: any) =>
      g.electionTracker === 0 &&
      g.subStatus === "election_presidentChoosingChancellor" &&
      g.sessions !== undefined,
    "chaos and the next election",
  )
  assert.equal(afterChaos.policies.board.liberal, 2, "the top card (liberal) is enacted")
  assert.equal(cards(afterChaos.policies.drawPile).length, 8, "2 left + 6 discarded, reshuffled")
  assert.equal(afterChaos.policies.discardPile, undefined, "discard pile emptied")
  assert.equal(afterChaos.lastSuccessfulPresidentId, undefined, "term limits forgotten")
  assert.equal(afterChaos.lastSuccessfulChancellorId, undefined, "term limits forgotten")
  const sessions: any[] = Object.values(afterChaos.sessions)
  assert.equal(sessions.length, 2)
  assert.equal(sessions[0].chancellorId, "randId2", "the failed government is recorded first")
  assert.equal(sessions[1].enactmentByFrustratedPopulace, true, "then the chaos enactment")

  const president: string = afterChaos.currentSession.presidentId
  const candidate: string = ["randId3", "randId4", "randId5", "randId6"].find(
    (id: string) => id !== president,
  ) as string
  assert.equal((await act(code, { type: "nominate", chancellorId: candidate })).status, 200)
  for (let i: number = 0; i < 7; i++) {
    assert.equal((await act(code, { type: "vote", ja: true })).status, 200)
  }
  const legislative: any = await waitForGame(
    code,
    (g: any) => g.subStatus === "legislativeSession_presidentDiscardingPolicy",
    "legislative session",
  )
  assert.equal(cards(legislative.currentSession.presidentPolicies).length, 3)
  assert.equal(legislative.electionTracker, 0)
})

test("the end-of-session reshuffle includes this session's discards", async () => {
  const code: string = "900002"
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
        drawPile: "fascist,fascist",
        discardPile: { liberal: 1, fascist: 1 },
        board: { liberal: 0, fascist: 0 },
      },
      electionTracker: 1,
    }),
  )
  const res: ApiResult = await act(code, { type: "discard", policy: "fascist" })
  assert.equal(res.status, 200, res.body)
  const reshuffled: any = await waitForGame(
    code,
    (g: any) => g.policies?.discardPile === undefined,
    "reshuffle",
  )
  const pile: string[] = cards(reshuffled.policies.drawPile)
  // 2 left + discards {liberal: 1, fascist: 1 + 1 from this session}
  assert.equal(pile.length, 5)
  assert.equal(pile.filter((policy: string) => policy === "fascist").length, 4)
  assert.equal(reshuffled.electionTracker, 0, "an enactment resets the election tracker")
})

test("a nomination sent during the intro is rejected", async () => {
  const code: string = await newGame()
  for (let i: number = 0; i < 4; i++) {
    assert.equal((await api("joinGame", { code })).status, 200)
  }
  assert.equal(
    (await api("startGame", { code, hidePicsGameInfo: false, skipLongIntro: true })).status,
    200,
  )
  const intro: any = await getGame(code)
  assert.equal(intro.status, "settingUp")
  const other: string = intro.players.find((p: any) => p.id !== intro.currentSession.presidentId).id

  const early: ApiResult = await act(code, { type: "nominate", chancellorId: other })
  assert.equal(early.error, "PAUSED", early.body)

  const started: any = await advanceWhenDue(code)
  assert.equal(started.subStatus, "election_presidentChoosingChancellor")
  assert.equal(started.currentSession.chancellorId, undefined)
  assert.equal((await act(code, { type: "nominate", chancellorId: other })).status, 200)
})

test("Chancellor eligibility: dead players, term limits, and the 5-alive exception", async () => {
  const code: string = "900004"
  const choosing: Record<string, unknown> = {
    status: "election",
    subStatus: "election_presidentChoosingChancellor",
    currentSession: { presidentId: "randId1" },
    lastSuccessfulPresidentId: "randId2",
    lastSuccessfulChancellorId: "randId3",
    policies: { drawPile: "liberal,liberal,liberal", board: { liberal: 0, fascist: 0 } },
  }
  const nominate: (id: string) => Promise<string | number> = async (id: string) => {
    const res: ApiResult = await act(code, { type: "nominate", chancellorId: id })
    return res.error ?? res.status
  }

  await putGame(code, game(choosing, 7, { 6: { isExecuted: true } }))
  assert.equal(await nominate("randId6"), "INELIGIBLE", "dead")
  assert.equal(await nominate("randId3"), "INELIGIBLE", "last Chancellor")
  assert.equal(await nominate("randId2"), "INELIGIBLE", "last President, 6 alive")
  assert.equal(await nominate("nobody"), "INELIGIBLE", "unknown player")
  assert.equal(await nominate("randId1"), "INELIGIBLE", "the President")

  // 7 players, 2 dead: with 5 alive, the last President becomes eligible
  await putGame(code, game(choosing, 7, { 5: { isExecuted: true }, 6: { isExecuted: true } }))
  assert.equal(await nominate("randId3"), "INELIGIBLE", "last Chancellor, 5 alive")
  assert.equal(await nominate("randId2"), 200, "last President, 5 alive")
})

test("a veto with the election tracker at 2 triggers chaos", async () => {
  const code: string = "900005"
  await putGame(
    code,
    game({
      status: "election",
      subStatus: "election_voting",
      electionTracker: 2,
      currentSession: { presidentId: "randId1", chancellorId: "randId3" },
      policies: {
        drawPile: "liberal,liberal,liberal,liberal,liberal,liberal",
        board: { liberal: 0, fascist: 5 },
      },
    }),
  )
  for (let i: number = 0; i < 7; i++) {
    assert.equal((await act(code, { type: "vote", ja: true })).status, 200)
  }
  const legislative: any = await waitForGame(
    code,
    (g: any) => g.subStatus === "legislativeSession_presidentDiscardingPolicy",
    "legislative session",
  )
  assert.equal(legislative.electionTracker, 2, "an election alone doesn't reset the tracker")
  assert.equal(legislative.lastSuccessfulPresidentId, "randId1")
  assert.equal((await act(code, { type: "discard", policy: "liberal" })).status, 200)
  assert.equal((await act(code, { type: "proposeVeto" })).status, 200)
  await waitForGame(
    code,
    (g: any) => g.subStatus === "legislativeSession_chancellorSeekingVeto",
    "veto request",
  )
  assert.equal((await act(code, { type: "answerVeto", accept: true })).status, 200)
  const afterChaos: any = await waitForGame(
    code,
    (g: any) => g.policies?.board?.liberal === 1,
    "chaos enactment",
  )
  assert.equal(afterChaos.electionTracker, 0, "chaos resets the tracker")
})

test("presidential power targets must be living players other than the President", async () => {
  const code: string = "900006"
  for (const subStatus of [
    "presidentialPower_investigateLoyalty",
    "presidentialPower_callSpecialElection",
    "presidentialPower_execution",
  ]) {
    await putGame(
      code,
      game(
        {
          status: "presidentialPower",
          subStatus,
          currentSession: { presidentId: "randId1", chancellorId: "randId3" },
          policies: { drawPile: "liberal,liberal,liberal", board: { liberal: 0, fascist: 2 } },
        },
        7,
        { 6: { isExecuted: true } },
      ),
    )
    for (const target of ["nobody", "randId6", "randId1"]) {
      const res: ApiResult = await act(code, { type: "usePower", targetId: target })
      assert.equal(res.error, "INELIGIBLE", `${subStatus} on ${target}: ${res.status} ${res.body}`)
    }
    const valid: ApiResult = await act(code, { type: "usePower", targetId: "randId4" })
    assert.equal(valid.status, 200, `${subStatus}: ${valid.body}`)
  }
})
