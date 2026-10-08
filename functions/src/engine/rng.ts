import { Rng } from "./types"

/**
 * A seeded random generator (mulberry32): the same seed always gives the same numbers, so a
 * game can be replayed from its seed and its actions.
 */
export function seededRng(seed: number): Rng {
  let a: number = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t: number = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates shuffle, in place. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i: number = items.length - 1; i > 0; i--) {
    const j: number = Math.floor(rng() * (i + 1))
    const swap: T = items[i]
    items[i] = items[j]
    items[j] = swap
  }
  return items
}
