/**
 * Helpers for the emulator tests. They call the API like a client would, and read and write the
 * database emulator directly as an admin.
 *
 * The functions run in dev mode (DEV=true in .env.demo-shtest), so requests need no login and
 * each request acts as the next fake player: randId0, randId1... in the order they arrive.
 */
import * as assert from "node:assert/strict"

export const API_URL: string = "http://127.0.0.1:5001/demo-shtest/us-central1/api"
const DATABASE_URL: string = "http://127.0.0.1:9000"
/** Where the functions keep their data in the emulator. */
const FUNCTIONS_NAMESPACE: string = "ns=demo-shtest"
/** The database instance the security rules apply to in the emulator. */
export const RULES_NAMESPACE: string = "ns=demo-shtest-default-rtdb"
const ADMIN: Record<string, string> = {
  Authorization: "Bearer owner",
  "Content-Type": "application/json",
}

export interface ApiResult {
  status: number
  body: string
  /** How long the request took. */
  ms: number
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve: () => void) => setTimeout(resolve, ms))
}

export async function api(
  path: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<ApiResult> {
  const start: number = Date.now()
  const res: Response = await fetch(`${API_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  return { status: res.status, body: await res.text(), ms: Date.now() - start }
}

/** Creates a lobby through the API and returns its code. */
export async function newGame(): Promise<string> {
  const res: ApiResult = await api("newGame")
  assert.equal(res.status, 201, res.body)
  return JSON.parse(res.body).code
}

export async function read(path: string): Promise<any> {
  const res: Response = await fetch(`${DATABASE_URL}/${path}.json?${FUNCTIONS_NAMESPACE}`, {
    headers: ADMIN,
  })
  return res.json()
}

export async function write(path: string, value: unknown): Promise<void> {
  const res: Response = await fetch(`${DATABASE_URL}/${path}.json?${FUNCTIONS_NAMESPACE}`, {
    method: "PUT",
    headers: ADMIN,
    body: JSON.stringify(value),
  })
  assert.equal(res.status, 200, await res.text())
}

export const getGame: (code: string) => Promise<any> = (code: string) =>
  read(`ongoingGames/${code}`)

export const putGame: (code: string, game: unknown) => Promise<void> = (
  code: string,
  game: unknown,
) => write(`ongoingGames/${code}`, game)

export const lockOf: (code: string) => Promise<any> = (code: string) => read(`gameLocks/${code}`)

/** Polls the game until `predicate` holds, and returns it. */
export async function waitForGame(
  code: string,
  predicate: (game: any) => boolean,
  what: string,
  timeoutMs: number = 20_000,
): Promise<any> {
  const start: number = Date.now()
  while (Date.now() - start < timeoutMs) {
    const game: any = await getGame(code)
    if (game !== null && predicate(game)) return game
    await sleep(300)
  }
  throw new Error(`Timed out waiting for: ${what}`)
}

export const cards: (pile: unknown) => string[] = (pile: unknown) =>
  pile ? String(pile).split(",") : []

/** Players randId0 (Hitler), randId1 and randId2 (fascists), then liberals. */
export function players(count: number, extra: Record<number, object> = {}): object[] {
  return Array.from({ length: count }, (_: unknown, i: number) => ({
    id: `randId${i}`,
    name: `p${i}`,
    role: i === 0 ? "hitler" : i < 3 ? "fascist" : "liberal",
    assetReference: "liberal_1",
    ...(extra[i] ?? {}),
  }))
}

/** A started 7-player game. Pass the phase and anything else to change in `overrides`. */
export function game(
  overrides: Record<string, unknown> = {},
  playerCount: number = 7,
  playerExtra: Record<number, object> = {},
): Record<string, unknown> {
  return {
    ownerId: "randId0",
    createdAt: Date.now(),
    startedAt: Date.now(),
    players: players(playerCount, playerExtra),
    connected: Object.fromEntries(
      Array.from({ length: playerCount }, (_: unknown, i: number) => [`randId${i}`, true]),
    ),
    gameType: playerCount <= 6 ? "fiveSix" : playerCount <= 8 ? "sevenEight" : "nineTen",
    executiveActions:
      playerCount <= 6
        ? { 3: "policyPeek", 4: "execution", 5: "execution" }
        : { 2: "investigateLoyalty", 3: "callSpecialElection", 4: "execution", 5: "execution" },
    settings: { hidePicsGameInfo: false, skipLongIntro: true },
    visibility: "private",
    electionTracker: 0,
    lastPresidentId: "randId1",
    ...overrides,
  }
}
