/** database.rules.json, checked against the database emulator with signed-in test users. */
import * as assert from "node:assert/strict"
import { before, test } from "node:test"

import { RULES_NAMESPACE } from "./helpers"

const DATABASE_URL: string = "http://127.0.0.1:9000"

const base64url: (value: object) => string = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")

/** An unsigned ID token, which the emulator accepts. */
function idToken(uid: string): string {
  const header: string = base64url({ alg: "none", typ: "JWT" })
  const payload: string = base64url({
    sub: uid,
    user_id: uid,
    iat: 0,
    exp: 9999999999,
    aud: "demo-shtest",
    iss: "https://securetoken.google.com/demo-shtest",
  })
  return `${header}.${payload}.`
}

/** Sends a request as `uid`: "admin" bypasses the rules, null is signed out. */
async function request(
  method: string,
  path: string,
  uid: string | null,
  body?: unknown,
): Promise<number> {
  const headers: Record<string, string> = uid === "admin" ? { Authorization: "Bearer owner" } : {}
  const auth: string = uid !== null && uid !== "admin" ? `&auth=${idToken(uid)}` : ""
  const res: Response = await fetch(`${DATABASE_URL}/${path}.json?${RULES_NAMESPACE}${auth}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res.status
}

const GAME: string = "ongoingGames/111111"

before(async () => {
  assert.equal(
    await request("PUT", GAME, "admin", {
      ownerId: "alice",
      players: [
        { id: "alice", role: "hitler" },
        { id: "bob", role: "liberal" },
      ],
      connected: { alice: true, bob: false },
    }),
    200,
  )
})

test("only the game's players can read it", async () => {
  assert.equal(await request("GET", GAME, "alice"), 200)
  assert.equal(await request("GET", GAME, "bob"), 200, "a player marked offline")
  assert.equal(await request("GET", GAME, "mallory"), 401, "another user")
  assert.equal(await request("GET", GAME, null), 401, "signed out")
  assert.equal(await request("GET", "ongoingGames", "alice"), 401, "the list of all games")
})

test("players can only set their own presence, to true or false", async () => {
  assert.equal(await request("PUT", `${GAME}/connected/bob`, "bob", true), 200)
  assert.equal(await request("PUT", `${GAME}/connected/bob`, "bob", false), 200)
  assert.equal(await request("PUT", `${GAME}/connected/alice`, "bob", false), 401, "someone else's")
  assert.equal(
    await request("PUT", `${GAME}/connected/mallory`, "mallory", true),
    401,
    "joining by adding oneself",
  )
  assert.equal(
    await request("PUT", `${GAME}/connected/bob`, "bob", { junk: "x".repeat(1000) }),
    401,
    "not a boolean",
  )
  assert.equal(await request("DELETE", `${GAME}/connected/bob`, "bob"), 401, "deleting it")
  assert.equal(await request("GET", GAME, "bob"), 200, "bob can still read the game")
})

test("players can't write the game itself", async () => {
  assert.equal(await request("PUT", `${GAME}/players/0/role`, "alice", "liberal"), 401)
  assert.equal(await request("PUT", `${GAME}/ownerId`, "bob", "bob"), 401)
})

test("players can't touch the game locks", async () => {
  assert.equal(await request("GET", "gameLocks/111111", "alice"), 401)
  assert.equal(await request("PUT", "gameLocks/111111", "alice", { token: "x", expiresAt: 0 }), 401)
})

test("players can't read or write action receipts", async () => {
  assert.equal(await request("GET", "actionReceipts/111111", "alice"), 401)
  assert.equal(await request("GET", "actionReceipts/111111/alice", "alice"), 401)
  assert.equal(
    await request("PUT", "actionReceipts/111111/alice", "alice", { id: "x", response: {} }),
    401,
  )
})
