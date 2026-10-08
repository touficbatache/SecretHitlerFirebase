/** viewFor: each player sees exactly what the rules let them know. */
import * as assert from "node:assert/strict"
import { describe, test } from "node:test"

import { GameState, Policy, PlayerInfo, PlayerView, viewFor } from "../../src/engine"

import { elect, enact, game, must, play } from "./helpers"

const knownRoles: (view: PlayerView) => Record<string, string> = (view: PlayerView) =>
  Object.fromEntries(
    view.players
      .filter((p: PlayerInfo) => p.role !== undefined)
      .map((p: PlayerInfo) => [p.id, p.role as string]),
  )

describe("roles", () => {
  // 7 players: p0 Hitler, p1 and p2 fascists, p3 to p6 liberals
  const seven: GameState = game({ players: 7 })

  test("a liberal only knows their own role", () => {
    assert.deepEqual(knownRoles(viewFor(seven, "p4")), { p4: "liberal" })
    assert.deepEqual(viewFor(seven, "p4").you, { id: "p4", role: "liberal", team: "liberal" })
  })

  test("a fascist knows the other fascists and Hitler", () => {
    assert.deepEqual(knownRoles(viewFor(seven, "p1")), {
      p0: "hitler",
      p1: "fascist",
      p2: "fascist",
    })
  })

  test("Hitler doesn't know the fascists in a 7 to 10 player game", () => {
    assert.deepEqual(knownRoles(viewFor(seven, "p0")), { p0: "hitler" })
  })

  test("Hitler knows the fascist in a 5 or 6 player game", () => {
    assert.deepEqual(knownRoles(viewFor(game({ players: 5 }), "p0")), {
      p0: "hitler",
      p1: "fascist",
    })
  })

  test("a spectator knows no role, and everyone knows every role once the game is over", () => {
    assert.deepEqual(knownRoles(viewFor(seven, "spectator")), {})
    assert.equal(viewFor(seven, "spectator").you, undefined)
    const over: GameState = elect(
      game({ players: 7, president: "p1", board: { liberal: 0, fascist: 3 } }),
      "p0",
    )
    assert.equal(Object.keys(knownRoles(viewFor(over, "p4"))).length, 7)
  })

  test("an investigation shows the President the target's team, not their role", () => {
    const investigated: GameState = must(
      enact(
        game({
          players: 7,
          president: "p3",
          board: { liberal: 0, fascist: 1 },
          drawPile: Array<Policy>(9).fill("fascist"),
        }),
        "p4",
        "fascist",
      ),
      { type: "usePower", by: "p3", targetId: "p0" },
    )
    const president: PlayerInfo | undefined = viewFor(investigated, "p3").players.find(
      (p: PlayerInfo) => p.id === "p0",
    )
    assert.deepEqual(president, { id: "p0", isAlive: true, team: "fascist" })
    const other: PlayerInfo | undefined = viewFor(investigated, "p4").players.find(
      (p: PlayerInfo) => p.id === "p0",
    )
    assert.deepEqual(other, { id: "p0", isAlive: true }, "only the President learns it")
  })
})

describe("cards", () => {
  const drawn: GameState = must(
    elect(game({ president: "p1", drawPile: ["liberal", "fascist", "fascist", "liberal"] }), "p4"),
    { type: "continue" },
  )

  test("nobody sees the draw pile, only how many policies are left", () => {
    for (const id of ["p0", "p1", "p4", "spectator"]) {
      const view: PlayerView = viewFor(drawn, id)
      assert.equal(view.drawPileCount, 1)
      assert.equal(JSON.stringify(view).includes('drawPile"'), false)
    }
  })

  test("only the President sees the policies they drew", () => {
    assert.deepEqual(viewFor(drawn, "p1").hand, ["liberal", "fascist", "fascist"])
    assert.equal(viewFor(drawn, "p4").hand, undefined)
    assert.equal(JSON.stringify(viewFor(drawn, "p4")).includes("presidentPolicies"), false)
  })

  test("then only the Chancellor sees the two they were passed", () => {
    const passed: GameState = must(drawn, { type: "discard", by: "p1", policy: "fascist" })
    assert.deepEqual(viewFor(passed, "p4").hand, ["liberal", "fascist"])
    assert.equal(viewFor(passed, "p1").hand, undefined)
    assert.equal(JSON.stringify(viewFor(passed, "p0")).includes("chancellorPolicies"), false)
  })

  test("only the President sees a policy peek, and only while it's on", () => {
    const peeked: GameState = must(
      enact(
        game({
          players: 5,
          president: "p1",
          board: { liberal: 0, fascist: 2 },
          drawPile: ["fascist", "fascist", "fascist", "liberal", "fascist", "liberal"],
        }),
        "p3",
        "fascist",
      ),
      { type: "usePower", by: "p1" },
    )
    assert.deepEqual(viewFor(peeked, "p1").peekedPolicies, ["liberal", "fascist", "liberal"])
    assert.equal(viewFor(peeked, "p3").peekedPolicies, undefined)
    const done: GameState = must(peeked, { type: "endPower", by: "p1" })
    assert.equal(viewFor(done, "p1").peekedPolicies, undefined)
  })
})

describe("votes", () => {
  test("hidden until everyone has voted, but who voted shows", () => {
    const voting: GameState = play(
      game({ president: "p1" }),
      { type: "nominate", by: "p1", chancellorId: "p4" },
      { type: "vote", by: "p2", ja: false },
    )
    const view: PlayerView = viewFor(voting, "p3")
    assert.deepEqual(view.session?.voted, ["p2"])
    assert.equal(view.session?.votes, undefined)
    assert.equal(viewFor(voting, "p2").session?.votes, undefined, "not even to the voter")

    const done: GameState = elect(game({ president: "p1" }), "p4", true)
    assert.equal(Object.keys(viewFor(done, "p3").session?.votes ?? {}).length, 7)
  })
})
