import * as constants from "./constants"

/**
 * With this many players alive or fewer, only the last elected Chancellor is
 * term-limited; the last elected President may be nominated again.
 */
export const SMALL_GAME_ALIVE_PLAYERS: number = 5

export function findPlayer(players: any[], playerId: string): any | undefined {
  return players.find((player: any) => player[constants.DATABASE_NODE_ID] === playerId)
}

export function isAlive(player: any): boolean {
  return player[constants.DATABASE_NODE_IS_EXECUTED] !== true
}

export function alivePlayerCount(players: any[]): number {
  return players.filter(isAlive).length
}

/**
 * A target for a presidential power (investigation, special election, execution)
 * must be another living player in this game.
 */
export function isValidPowerTarget(players: any[], targetId: string, presidentId: string): boolean {
  const target: any | undefined = findPlayer(players, targetId)
  return target !== undefined && isAlive(target) && targetId !== presidentId
}

/**
 * Official rules: the Chancellor candidate must be another living player, and the
 * last elected President and Chancellor are term-limited. With 5 or fewer players
 * alive, only the last elected Chancellor is term-limited.
 */
export function isEligibleForChancellor(options: {
  players: any[]
  candidateId: string
  presidentId: string
  lastElectedPresidentId: string | undefined
  lastElectedChancellorId: string | undefined
}): boolean {
  const { players, candidateId, presidentId, lastElectedPresidentId, lastElectedChancellorId } =
    options

  const candidate: any | undefined = findPlayer(players, candidateId)
  if (candidate === undefined || !isAlive(candidate) || candidateId === presidentId) {
    return false
  }

  if (candidateId === lastElectedChancellorId) {
    return false
  }

  const isPresidentTermLimited: boolean = alivePlayerCount(players) > SMALL_GAME_ALIVE_PLAYERS
  if (isPresidentTermLimited && candidateId === lastElectedPresidentId) {
    return false
  }

  return true
}
