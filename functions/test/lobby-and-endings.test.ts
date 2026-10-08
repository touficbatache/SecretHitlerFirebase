/** Closing lobbies and finished games are handled cleanly. */
import * as assert from "node:assert/strict"
import { test } from "node:test"

import { api, ApiResult, game, getGame, newGame, putGame, sleep, write } from "./helpers"

test("actions after the game ended are rejected with 457, not a crash", async () => {
  const code: string = "930001"
  await putGame(
    code,
    game(
      {
        status: "gameEnded",
        subStatus: "gameEnded_liberal",
        policies: { board: { liberal: 5, fascist: 0 } },
      },
      5,
    ),
  )
  const actions: [string, Record<string, unknown>][] = [
    ["chooseChancellor", { chancellorId: "randId2" }],
    ["presidentDiscardPolicy", { policy: "liberal" }],
    ["chancellorDiscardPolicy", { policy: "liberal" }],
    ["presidentialPower", { player: "randId2" }],
    ["askForVeto", {}],
    ["answerVeto", { refuseVeto: true }],
    ["vote", { vote: true }],
  ]
  for (const [path, body] of actions) {
    const res: ApiResult = await api(path, { code, ...body })
    assert.equal(res.status, 457, `${path}: ${res.status} ${res.body}`)
  }
})

test("nobody can join a lobby while its owner is closing it", async () => {
  const code: string = await newGame()
  for (let i: number = 0; i < 2; i++) {
    assert.equal((await api("joinGame", { code })).status, 200)
  }
  // In dev mode, unJoinGame acts as randId{player count}: make that player the owner
  await write(`ongoingGames/${code}/ownerId`, "randId3")
  const closing: Promise<ApiResult> = api("unJoinGame", { code })
  await sleep(700) // during the pause before the game is removed
  assert.equal((await getGame(code))?.status, "deleted")
  const late: ApiResult = await api("joinGame", { code })
  assert.equal(late.status, 452, late.body)
  assert.equal((await closing).status, 200)
  assert.equal(await getGame(code), null, "the game is removed")
})
