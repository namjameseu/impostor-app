/** Mirrors backend/app/game/round_manager.py's `rng: random.Random = system_rng` pattern:
 * production code defaults to the crypto-backed Rng, tests inject a seeded one for determinism. */
export interface Rng {
  choice<T>(items: readonly T[]): T
  sample<T>(items: readonly T[], count: number): T[]
}

function randomInt(maxExclusive: number): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0] % maxExclusive
}

function choice<T>(items: readonly T[]): T {
  return items[randomInt(items.length)]
}

function sample<T>(items: readonly T[], count: number): T[] {
  const pool = [...items]
  const result: T[] = []
  for (let i = 0; i < count; i++) {
    const index = randomInt(pool.length)
    result.push(pool[index])
    pool.splice(index, 1)
  }
  return result
}

/** crypto-backed — fairness for a local game, not a security boundary, but a step up from
 * naive Math.random(). */
export const systemRng: Rng = { choice, sample }
