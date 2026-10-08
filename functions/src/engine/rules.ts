import { Power, Role, Team } from "./types"

/** The official game: 6 liberal and 11 fascist policies. */
export const LIBERAL_POLICIES: number = 6
export const FASCIST_POLICIES: number = 11

export const MIN_PLAYERS: number = 5
export const MAX_PLAYERS: number = 10

/** Policies needed to win. */
export const LIBERAL_POLICIES_TO_WIN: number = 5
export const FASCIST_POLICIES_TO_WIN: number = 6

/** Hitler elected Chancellor once this many fascist policies are enacted wins the game. */
export const HITLER_CHANCELLOR_FASCIST_POLICIES: number = 3

/** The Chancellor may propose a veto once this many fascist policies are enacted. */
export const VETO_FASCIST_POLICIES: number = 5

/** Three failed governments in a row: the frustrated populace enacts the top policy. */
export const ELECTION_TRACKER_LIMIT: number = 3

/** The draw pile is reshuffled with the discards when fewer policies than this remain. */
export const MIN_DRAW_PILE: number = 3

/**
 * With this many living players or fewer, only the last elected Chancellor is term-limited:
 * the last elected President may be nominated.
 */
export const SMALL_GAME_ALIVE_PLAYERS: number = 5

/** Liberals and fascists, besides Hitler, by player count. */
export const ROLE_COUNTS: Record<number, { liberals: number; fascists: number }> = {
  5: { liberals: 3, fascists: 1 },
  6: { liberals: 4, fascists: 1 },
  7: { liberals: 4, fascists: 2 },
  8: { liberals: 5, fascists: 2 },
  9: { liberals: 5, fascists: 3 },
  10: { liberals: 6, fascists: 3 },
}

/** The fascist track: the power each fascist policy grants, by the policy's position. */
export function powersFor(playerCount: number): Partial<Record<number, Power>> {
  if (playerCount <= 6) {
    return { 3: "policyPeek", 4: "execution", 5: "execution" }
  }
  if (playerCount <= 8) {
    return { 2: "investigateLoyalty", 3: "callSpecialElection", 4: "execution", 5: "execution" }
  }
  return {
    1: "investigateLoyalty",
    2: "investigateLoyalty",
    3: "callSpecialElection",
    4: "execution",
    5: "execution",
  }
}

export function teamOf(role: Role): Team {
  return role === "liberal" ? "liberal" : "fascist"
}

/** In 5 and 6 player games, Hitler knows who the fascist is. */
export function hitlerKnowsFascists(playerCount: number): boolean {
  return playerCount <= 6
}
