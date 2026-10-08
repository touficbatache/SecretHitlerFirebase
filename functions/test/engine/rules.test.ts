/** The rules of Secret Hitler, one by one. Runs without the emulators: npm run test:engine. */
import * as assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  ChaosRecord,
  GameState,
  HistoryEntry,
  Player,
  Policy,
  Role,
  rules,
  seededRng,
  Session,
  setupGame,
} from "../../src/engine"

import { elect, enact, game, ids, must, play, president, rejected, totalCards } from "./helpers"

const LIBERALS: Policy[] = Array<Policy>(9).fill("liberal")
const FASCISTS: Policy[] = Array<Policy>(9).fill("fascist")

describe("setup", () => {
  test("deals the official roles for 5 to 10 players", () => {
    const expected: Record<number, [number, number]> = {
      5: [3, 1],
      6: [4, 1],
      7: [4, 2],
      8: [5, 2],
      9: [5, 3],
      10: [6, 3],
    }
    for (let count: number = 5; count <= 10; count++) {
      const roles: Role[] = setupGame(ids(count), seededRng(count)).players.map(
        (p: Player) => p.role,
      )
      const [liberals, fascists] = expected[count]
      assert.equal(roles.filter((r: Role) => r === "liberal").length, liberals, `${count} players`)
      assert.equal(roles.filter((r: Role) => r === "fascist").length, fascists, `${count} players`)
      assert.equal(roles.filter((r: Role) => r === "hitler").length, 1, `${count} players`)
    }
  })

  test("shuffles 6 liberal and 11 fascist policies", () => {
    const state: GameState = setupGame(ids(7), seededRng(3))
    assert.equal(state.drawPile.length, 17)
    assert.equal(state.drawPile.filter((p: Policy) => p === "liberal").length, 6)
  })

  test("the same seed gives the same game, so games can be replayed", () => {
    assert.deepEqual(setupGame(ids(8), seededRng(42)), setupGame(ids(8), seededRng(42)))
    assert.notDeepEqual(setupGame(ids(8), seededRng(42)), setupGame(ids(8), seededRng(43)))
  })

  test("needs 5 to 10 players with distinct ids", () => {
    assert.throws(() => setupGame(ids(4), seededRng(1)))
    assert.throws(() => setupGame(ids(11), seededRng(1)))
    assert.throws(() => setupGame(["a", "a", "b", "c", "d"], seededRng(1)))
  })

  test("grants the official presidential powers for each game size", () => {
    assert.deepEqual(rules.powersFor(5), { 3: "policyPeek", 4: "execution", 5: "execution" })
    assert.deepEqual(rules.powersFor(8), {
      2: "investigateLoyalty",
      3: "callSpecialElection",
      4: "execution",
      5: "execution",
    })
    assert.deepEqual(rules.powersFor(9)[1], "investigateLoyalty")
    assert.deepEqual(rules.powersFor(10)[2], "investigateLoyalty")
  })

  test("starts with the intro: nothing but continue is allowed", () => {
    const intro: GameState = game({ inIntro: true })
    assert.equal(intro.phase.name, "intro")
    assert.equal(rejected(intro, { type: "nominate", by: "p1", chancellorId: "p3" }), "wrongPhase")
    assert.equal(must(intro, { type: "continue" }).phase.name, "nomination")
  })
})

describe("nomination", () => {
  test("only the President nominates, during the nomination", () => {
    const state: GameState = game({ president: "p1" })
    assert.equal(rejected(state, { type: "nominate", by: "p2", chancellorId: "p3" }), "notYourTurn")
    assert.equal(rejected(state, { type: "vote", by: "p2", ja: true }), "wrongPhase")
  })

  test("the Chancellor must be another living player of the game", () => {
    const state: GameState = game({ president: "p1", dead: ["p6"] })
    const nominate: (id: string) => string = (id: string) =>
      rejected(state, { type: "nominate", by: "p1", chancellorId: id })
    assert.equal(nominate("p1"), "ineligible")
    assert.equal(nominate("p6"), "ineligible")
    assert.equal(nominate("nobody"), "ineligible")
  })

  test("the last elected President and Chancellor are term-limited", () => {
    const state: GameState = game({
      president: "p1",
      termLimits: { presidentId: "p2", chancellorId: "p3" },
    })
    assert.equal(rejected(state, { type: "nominate", by: "p1", chancellorId: "p2" }), "ineligible")
    assert.equal(rejected(state, { type: "nominate", by: "p1", chancellorId: "p3" }), "ineligible")
    must(state, { type: "nominate", by: "p1", chancellorId: "p4" })
  })

  test("with 5 players alive, only the last elected Chancellor is term-limited", () => {
    const state: GameState = game({
      president: "p1",
      dead: ["p5", "p6"],
      termLimits: { presidentId: "p2", chancellorId: "p3" },
    })
    assert.equal(rejected(state, { type: "nominate", by: "p1", chancellorId: "p3" }), "ineligible")
    must(state, { type: "nominate", by: "p1", chancellorId: "p2" })
  })
})

describe("voting", () => {
  test("a majority of Ja elects the government and term-limits it", () => {
    const state: GameState = elect(game({ president: "p1", electionTracker: 1 }), "p4")
    assert.equal(state.phase.name, "voteResult")
    assert.equal(state.session?.passed, true)
    assert.deepEqual(state.next, { kind: "beginLegislativeSession" })
    assert.deepEqual(state.termLimits, { presidentId: "p1", chancellorId: "p4" })
    assert.equal(state.electionTracker, 1, "an election alone doesn't reset the tracker")
  })

  test("a tie fails", () => {
    let state: GameState = must(game({ players: 6, president: "p1" }), {
      type: "nominate",
      by: "p1",
      chancellorId: "p2",
    })
    for (const [i, id] of ids(6).entries()) {
      state = must(state, { type: "vote", by: id, ja: i < 3 })
    }
    assert.equal(state.session?.passed, false)
    assert.equal(state.electionTracker, 1)
  })

  test("only living players vote, once each, and the vote ends when they all have", () => {
    let state: GameState = must(game({ players: 6, president: "p1", dead: ["p5"] }), {
      type: "nominate",
      by: "p1",
      chancellorId: "p2",
    })
    assert.equal(rejected(state, { type: "vote", by: "p5", ja: true }), "notYourTurn")
    state = must(state, { type: "vote", by: "p0", ja: true })
    assert.equal(rejected(state, { type: "vote", by: "p0", ja: false }), "notYourTurn")
    state = play(
      state,
      ...["p1", "p2", "p3", "p4"].map((by: string) => ({ type: "vote" as const, by, ja: true })),
    )
    assert.equal(state.phase.name, "voteResult", "5 living players voted")
  })

  test("a failed vote advances the tracker, and the presidency passes to the next living player", () => {
    let state: GameState = elect(game({ president: "p1", dead: ["p2"] }), "p4", false)
    assert.equal(state.electionTracker, 1)
    assert.deepEqual(state.termLimits, {}, "a failed government isn't term-limited")
    state = must(state, { type: "continue" })
    assert.equal(president(state), "p3", "p2 is dead")
    assert.equal(state.history.length, 1)
  })

  test("the presidency wraps around the table", () => {
    const state: GameState = must(elect(game({ president: "p6" }), "p4", false), {
      type: "continue",
    })
    assert.equal(president(state), "p0")
  })
})

describe("chaos", () => {
  test("a third failed government enacts the top policy and forgets the term limits", () => {
    const failed: GameState = elect(
      game({
        president: "p1",
        electionTracker: 2,
        termLimits: { presidentId: "p4", chancellorId: "p5" },
        board: { liberal: 1, fascist: 2 },
        drawPile: ["fascist", "liberal", "liberal", "fascist"],
      }),
      "p3",
      false,
    )
    assert.deepEqual(failed.next, { kind: "frustratedPopulace" })
    assert.equal(failed.board.fascist, 2, "nothing is enacted while the votes show")

    const state: GameState = must(failed, { type: "continue" })
    assert.deepEqual(state.board, { liberal: 1, fascist: 3 })
    assert.equal(state.phase.name, "nomination", "the power of a chaos policy is ignored")
    assert.equal(state.electionTracker, 0)
    assert.deepEqual(state.termLimits, {})
    assert.equal(president(state), "p2")
    assert.equal((state.history[0] as Session).chancellorId, "p3", "the failed government first")
    assert.deepEqual(state.history[1], { chaos: true, enactedPolicy: "fascist" } as ChaosRecord)
  })

  test("chaos with 3 policies left reshuffles, so the next President still draws 3", () => {
    const state: GameState = must(
      elect(
        game({
          president: "p1",
          electionTracker: 2,
          drawPile: ["liberal", "fascist", "fascist"],
          discardPile: { liberal: 2, fascist: 4 },
        }),
        "p3",
        false,
      ),
      { type: "continue" },
    )
    assert.equal(state.drawPile.length, 8, "2 left + 6 discarded")
    assert.deepEqual(state.discardPile, { liberal: 0, fascist: 0 })
    const drawn: GameState = must(elect(state, "p4"), { type: "continue" })
    assert.equal(drawn.session?.presidentPolicies?.length, 3)
  })

  test("chaos can win the game", () => {
    const state: GameState = must(
      elect(
        game({
          president: "p1",
          electionTracker: 2,
          board: { liberal: 4, fascist: 0 },
          drawPile: ["liberal", "fascist", "fascist"],
        }),
        "p3",
        false,
      ),
      { type: "continue" },
    )
    assert.deepEqual(state.phase, {
      name: "gameOver",
      winner: "liberal",
      reason: "liberalPolicies",
    })
  })
})

describe("legislative session", () => {
  const drawn: () => GameState = () =>
    must(
      elect(
        game({ president: "p1", drawPile: ["liberal", "fascist", "fascist", "liberal"] }),
        "p4",
      ),
      { type: "continue" },
    )

  test("the President draws the top 3 policies and discards one", () => {
    const state: GameState = drawn()
    assert.deepEqual(state.session?.presidentPolicies, ["liberal", "fascist", "fascist"])
    assert.deepEqual(state.drawPile, ["liberal"])
    assert.equal(rejected(state, { type: "discard", by: "p4", policy: "fascist" }), "notYourTurn")
    const discarded: GameState = must(state, { type: "discard", by: "p1", policy: "fascist" })
    assert.deepEqual(discarded.session?.chancellorPolicies, ["liberal", "fascist"])
    assert.deepEqual(discarded.discardPile, { liberal: 0, fascist: 1 })
  })

  test("a policy that isn't in hand can't be discarded", () => {
    const state: GameState = must(elect(game({ president: "p1", drawPile: [...FASCISTS] }), "p4"), {
      type: "continue",
    })
    assert.equal(rejected(state, { type: "discard", by: "p1", policy: "liberal" }), "invalidAction")
  })

  test("the Chancellor enacts the other policy, which resets the tracker", () => {
    let state: GameState = must(drawn(), { type: "discard", by: "p1", policy: "fascist" })
    state.electionTracker = 2
    state = must(state, { type: "discard", by: "p4", policy: "fascist" })
    assert.deepEqual(state.board, { liberal: 1, fascist: 0 })
    assert.equal(state.session?.enactedPolicy, "liberal")
    assert.equal(state.electionTracker, 0)
    assert.equal(state.phase.name, "policyEnacted")
    assert.deepEqual(state.next, { kind: "nextElection" })
  })

  test("the end of the session reshuffles, including its own discards", () => {
    const state: GameState = play(
      drawn(),
      { type: "discard", by: "p1", policy: "fascist" },
      { type: "discard", by: "p4", policy: "fascist" },
    )
    assert.equal(state.drawPile.length, 3, "1 left + 2 discarded this session")
    assert.equal(totalCards(state), 4)
  })

  test("the 5th liberal policy wins, the 6th fascist policy wins", () => {
    const liberalWin: GameState = enact(
      game({ president: "p1", board: { liberal: 4, fascist: 0 }, drawPile: LIBERALS }),
      "p4",
      "liberal",
    )
    assert.deepEqual(liberalWin.phase, {
      name: "gameOver",
      winner: "liberal",
      reason: "liberalPolicies",
    })
    const fascistWin: GameState = enact(
      game({ president: "p1", board: { liberal: 0, fascist: 5 }, drawPile: FASCISTS }),
      "p4",
      "fascist",
    )
    assert.deepEqual(fascistWin.phase, {
      name: "gameOver",
      winner: "fascist",
      reason: "fascistPolicies",
    })
    assert.equal(fascistWin.session, undefined)
    assert.equal(fascistWin.history.length, 1)
  })

  test("Hitler elected Chancellor wins once 3 fascist policies are enacted, not before", () => {
    const early: GameState = elect(
      game({ president: "p1", board: { liberal: 0, fascist: 2 } }),
      "p0",
    )
    assert.equal(early.phase.name, "voteResult")
    const late: GameState = elect(
      game({ president: "p1", board: { liberal: 0, fascist: 3 } }),
      "p0",
    )
    assert.deepEqual(late.phase, { name: "gameOver", winner: "fascist", reason: "hitlerElected" })
  })
})

describe("veto", () => {
  const atChancellor: (fascists: number, tracker?: number) => GameState = (
    fascists: number,
    tracker: number = 0,
  ) =>
    play(
      elect(
        game({
          president: "p1",
          board: { liberal: 0, fascist: fascists },
          electionTracker: tracker,
          drawPile: ["liberal", "liberal", "fascist", "liberal", "liberal"],
        }),
        "p4",
      ),
      { type: "continue" },
      { type: "discard", by: "p1", policy: "fascist" },
    )

  test("needs 5 fascist policies", () => {
    assert.equal(rejected(atChancellor(4), { type: "proposeVeto", by: "p4" }), "wrongPhase")
    assert.equal(rejected(atChancellor(5), { type: "proposeVeto", by: "p1" }), "notYourTurn")
    assert.equal(
      must(atChancellor(5), { type: "proposeVeto", by: "p4" }).phase.name,
      "vetoRequested",
    )
  })

  test("refused: the Chancellor must enact, and can't ask again", () => {
    const refused: GameState = play(
      atChancellor(5),
      { type: "proposeVeto", by: "p4" },
      { type: "answerVeto", by: "p1", accept: false },
    )
    assert.equal(refused.phase.name, "chancellorDiscard")
    assert.equal(rejected(refused, { type: "proposeVeto", by: "p4" }), "wrongPhase")
    assert.equal(must(refused, { type: "discard", by: "p4", policy: "liberal" }).board.liberal, 1)
  })

  test("accepted: both policies are discarded and the tracker advances", () => {
    const accepted: GameState = play(
      atChancellor(5),
      { type: "proposeVeto", by: "p4" },
      { type: "answerVeto", by: "p1", accept: true },
    )
    assert.equal(accepted.phase.name, "vetoAccepted")
    assert.equal(accepted.electionTracker, 1)
    assert.deepEqual(accepted.board, { liberal: 0, fascist: 5 })
    assert.equal(totalCards(accepted), 10)
    assert.deepEqual(accepted.next, { kind: "nextElection" })
  })

  test("accepted with the tracker at 2: chaos", () => {
    const accepted: GameState = play(
      atChancellor(5, 2),
      { type: "proposeVeto", by: "p4" },
      { type: "answerVeto", by: "p1", accept: true },
    )
    assert.deepEqual(accepted.next, { kind: "frustratedPopulace" })
    const chaos: GameState = must(accepted, { type: "continue" })
    assert.equal(chaos.board.liberal + chaos.board.fascist, 6, "the top policy was enacted")
    assert.deepEqual(chaos.history.at(-1), {
      chaos: true,
      enactedPolicy: chaos.board.liberal === 1 ? "liberal" : "fascist",
    })
  })
})

describe("presidential powers", () => {
  test("policy peek: the President sees the top 3, which stay in place", () => {
    const peek: GameState = enact(
      game({
        players: 5,
        president: "p1",
        board: { liberal: 0, fascist: 2 },
        drawPile: ["fascist", "fascist", "fascist", "liberal", "fascist", "liberal"],
      }),
      "p3",
      "fascist",
    )
    assert.deepEqual(peek.phase, { name: "power", power: "policyPeek", used: false, done: false })
    const pile: Policy[] = [...peek.drawPile]
    const used: GameState = must(peek, { type: "usePower", by: "p1" })
    assert.deepEqual(used.session?.peekedPolicies, pile.slice(0, 3))
    assert.deepEqual(used.drawPile, pile)
    const done: GameState = must(used, { type: "endPower", by: "p1" })
    assert.deepEqual(done.next, { kind: "nextElection" })
  })

  const powerGame: (power: string, scenario?: Parameters<typeof game>[0]) => GameState = (
    power: string,
    scenario: Parameters<typeof game>[0] = {},
  ) => {
    const fascists: Record<string, number> = {
      investigateLoyalty: 1,
      callSpecialElection: 2,
      execution: 3,
    }
    const state: GameState = enact(
      game({
        president: "p1",
        board: { liberal: 0, fascist: fascists[power] },
        drawPile: FASCISTS,
        ...scenario,
      }),
      "p4",
      "fascist",
    )
    assert.equal(state.phase.name === "power" && state.phase.power, power)
    return state
  }

  test("investigation: the President learns a team, once per player", () => {
    const state: GameState = powerGame("investigateLoyalty")
    assert.equal(rejected(state, { type: "usePower", by: "p1" }), "invalidAction")
    assert.equal(rejected(state, { type: "usePower", by: "p1", targetId: "p1" }), "ineligible")
    const used: GameState = must(state, { type: "usePower", by: "p1", targetId: "p3" })
    assert.equal(used.session?.investigatedId, "p3")
    assert.equal(used.players[3].wasInvestigated, true)
    assert.equal(rejected(used, { type: "usePower", by: "p1", targetId: "p5" }), "wrongPhase")

    const next: GameState = play(used, { type: "endPower", by: "p1" }, { type: "continue" })
    assert.equal(president(next), "p2")
    // In a 9-player game the 1st and 2nd fascist policies both investigate; here, fake a second
    // investigation for p2 to check that p3 can't be investigated twice
    const again: GameState = structuredClone(next)
    again.phase = { name: "power", power: "investigateLoyalty", used: false, done: false }
    assert.equal(rejected(again, { type: "usePower", by: "p2", targetId: "p3" }), "ineligible")
    must(again, { type: "usePower", by: "p2", targetId: "p5" })
  })

  test("special election: the chosen player presides, then the rotation goes back", () => {
    const state: GameState = powerGame("callSpecialElection")
    const chosen: GameState = must(state, { type: "usePower", by: "p1", targetId: "p5" })
    assert.deepEqual(chosen.next, { kind: "nextElection" })

    const special: GameState = must(chosen, { type: "continue" })
    assert.equal(president(special), "p5")
    assert.equal(special.session?.isSpecialElection, true)

    const after: GameState = must(elect(special, "p3", false), { type: "continue" })
    assert.equal(president(after), "p2", "back to the player after the one who called it")
  })

  test("execution: the player is out of the game", () => {
    const state: GameState = must(powerGame("execution"), {
      type: "usePower",
      by: "p1",
      targetId: "p2",
    })
    assert.equal(state.players[2].isAlive, false)
    const next: GameState = must(state, { type: "continue" })
    assert.equal(president(next), "p3", "the executed player is skipped")
    assert.equal(rejected(next, { type: "nominate", by: "p3", chancellorId: "p2" }), "ineligible")
    const voting: GameState = must(next, { type: "nominate", by: "p3", chancellorId: "p5" })
    assert.equal(rejected(voting, { type: "vote", by: "p2", ja: true }), "notYourTurn")
  })

  test("executing Hitler wins the game for the liberals", () => {
    const state: GameState = must(powerGame("execution"), {
      type: "usePower",
      by: "p1",
      targetId: "p0",
    })
    assert.deepEqual(state.phase, { name: "gameOver", winner: "liberal", reason: "hitlerExecuted" })
  })

  test("only the President uses the power, on a living player", () => {
    const state: GameState = powerGame("execution", { dead: ["p6"] })
    assert.equal(rejected(state, { type: "usePower", by: "p4", targetId: "p2" }), "notYourTurn")
    assert.equal(rejected(state, { type: "usePower", by: "p1", targetId: "p6" }), "ineligible")
  })
})

describe("pauses and the end of the game", () => {
  test("during a pause, only continue is allowed", () => {
    const paused: GameState = elect(game({ president: "p1" }), "p4")
    assert.equal(rejected(paused, { type: "discard", by: "p1", policy: "liberal" }), "wrongPhase")
    assert.equal(rejected(game(), { type: "continue" }), "wrongPhase")
  })

  test("nothing is allowed once the game is over", () => {
    const over: GameState = elect(
      game({ president: "p1", board: { liberal: 0, fascist: 3 } }),
      "p0",
    )
    assert.equal(rejected(over, { type: "continue" }), "wrongPhase")
  })

  test("apply never changes the state it's given", () => {
    const state: GameState = game({ president: "p1" })
    const before: string = JSON.stringify(state)
    must(state, { type: "nominate", by: "p1", chancellorId: "p4" })
    rejected(state, { type: "nominate", by: "p2", chancellorId: "p4" })
    assert.equal(JSON.stringify(state), before)
  })

  test("the history keeps every government and chaos in order", () => {
    let state: GameState = game({ president: "p1", drawPile: LIBERALS })
    state = must(elect(state, "p4", false), { type: "continue" })
    state = must(enact(state, "p5", "liberal"), { type: "continue" })
    const history: HistoryEntry[] = state.history
    assert.equal(history.length, 2)
    assert.equal((history[0] as Session).passed, false)
    assert.equal((history[1] as Session).enactedPolicy, "liberal")
  })
})
