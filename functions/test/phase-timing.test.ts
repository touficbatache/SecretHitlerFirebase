/**
 * Each request finishes its phase change before it responds: Cloud Functions only guarantees
 * CPU while a request is open.
 */
import * as assert from "node:assert/strict"
import { test } from "node:test"

import { api, cards, game, getGame, newGame, putGame } from "./helpers"

test("a game played through the API moves on before each request responds", async () => {
  const code: string = await newGame()
  for (let i: number = 0; i < 4; i++) await api("joinGame", { code })

  await api("startGame", { code, hidePicsGameInfo: false, skipLongIntro: true })
  let current: any = await getGame(code)
  assert.equal(current.subStatus, "election_presidentChoosingChancellor", "startGame: intro over")

  const president: string = current.currentSession.presidentId
  const chancellor: string = current.players
    .map((p: any) => p.id)
    .find((id: string) => id !== president)
  await api("chooseChancellor", { code, chancellorId: chancellor })
  for (let i: number = 0; i < 5; i++) await api("vote", { code, vote: true })
  current = await getGame(code)
  assert.equal(
    current.subStatus,
    "legislativeSession_presidentDiscardingPolicy",
    "last vote: the President already holds the policies",
  )

  await api("presidentDiscardPolicy", {
    code,
    policy: cards(current.currentSession.presidentPolicies)[0],
  })
  current = await getGame(code)
  await api("chancellorDiscardPolicy", {
    code,
    policy: cards(current.currentSession.chancellorPolicies)[0],
  })
  current = await getGame(code)
  assert.ok(
    current.subStatus === "election_presidentChoosingChancellor" ||
      current.status === "presidentialPower" ||
      current.status === "gameEnded",
    `enactment: the next phase began (${current.subStatus})`,
  )
})

test("a failed vote at tracker 2 responds after chaos and the next election", async () => {
  const code: string = "910001"
  await putGame(
    code,
    game(
      {
        status: "election",
        subStatus: "election_voting",
        electionTracker: 2,
        currentSession: { presidentId: "randId1", chancellorId: "randId2" },
        policies: {
          drawPile: "liberal,liberal,liberal,liberal",
          board: { liberal: 0, fascist: 0 },
        },
      },
      5,
    ),
  )
  for (let i: number = 0; i < 5; i++) await api("vote", { code, vote: false })
  const after: any = await getGame(code)
  assert.equal(after.policies.board.liberal, 1)
  assert.equal(after.subStatus, "election_presidentChoosingChancellor")
})
