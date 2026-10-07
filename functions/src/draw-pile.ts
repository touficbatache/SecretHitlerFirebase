import { Policy } from "./objects"
import { shuffle } from "./utils"

export const MIN_DRAW_PILE_SIZE: number = 3

export interface DiscardPile {
  liberal?: number
  fascist?: number
}

/**
 * Official rule: when fewer than 3 policies remain in the draw pile, shuffle them
 * together with the discard pile to form a new draw pile.
 *
 * Returns the new draw pile, or undefined when no reshuffle is needed.
 */
export function reshuffledDrawPile(
  drawPile: string[],
  discardPile: DiscardPile | undefined,
): string[] | undefined {
  if (drawPile.length >= MIN_DRAW_PILE_SIZE) {
    return undefined
  }

  const policies: string[] = [...drawPile]
  for (let i: number = 0; i < (discardPile?.liberal ?? 0); i++) {
    policies.push(Policy.LIBERAL)
  }
  for (let i: number = 0; i < (discardPile?.fascist ?? 0); i++) {
    policies.push(Policy.FASCIST)
  }
  shuffle(policies)

  return policies
}
