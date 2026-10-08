/** Closing lobbies and finished games are handled cleanly. */
import * as assert from "node:assert/strict"
import { test } from "node:test"

import {
  api,
  ApiResult,
  game,
  getGame,
  newGame,
  putGame,
  recordEvents,
  sleep,
  write,
} from "./helpers"

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

test("closing a lobby sends its players away, then removes it", async () => {
  const code: string = await newGame()
  for (let i: number = 0; i < 2; i++) {
    assert.equal((await api("joinGame", { code })).status, 200)
  }
  // In dev mode, unJoinGame acts as randId{player count}: make that player the owner
  await write(`ongoingGames/${code}/ownerId`, "randId3")

  const recording: { events: { type: string; data: any }[]; stop: () => void } = recordEvents(
    `ongoingGames/${code}`,
  )
  await sleep(500)
  const close: ApiResult = await api("unJoinGame", { code })
  assert.equal(close.status, 200, close.body)
  assert.ok(close.ms < 3000, `closing took ${close.ms}ms`)
  await sleep(500)
  recording.stop()

  // Players listening to the game first see it emptied (and leave), then it's removed
  const emptied: number = recording.events.findIndex(
    (event: { type: string; data: any }) => event.data?.status === "deleted",
  )
  const removed: number = recording.events.findIndex(
    (event: { type: string; data: any }) => event.type === "put" && event.data === null,
  )
  assert.ok(emptied > 0 && removed > emptied, JSON.stringify(recording.events.slice(1)))
  assert.equal(await getGame(code), null)
  assert.equal((await api("joinGame", { code })).status, 452, "a late join finds no game")
})
