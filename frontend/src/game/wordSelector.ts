/** Port of backend/app/game/word_selector.py. */
import { GameValidationError } from './errors'
import { systemRng, type Rng } from './random'

export interface WordCandidate {
  id: number
  word: string
  category_id: number
  category_name: string
  similar_word: string | null
  hint: string | null
}

/** Pick a category uniformly, then a word in it, preferring words not yet used this game.
 *
 * Callers restrict `candidates` to a single category for specific-category games.
 * Once every candidate has been used, words may repeat. */
export function selectWord(
  candidates: readonly WordCandidate[],
  usedWordIds: ReadonlySet<number>,
  rng: Rng = systemRng,
): WordCandidate {
  if (!candidates.length) {
    throw new GameValidationError("No enabled words are available for this game's category.")
  }
  const fresh = candidates.filter((c) => !usedWordIds.has(c.id))
  const pool = fresh.length ? fresh : candidates

  const byCategory = new Map<number, WordCandidate[]>()
  for (const candidate of pool) {
    const list = byCategory.get(candidate.category_id)
    if (list) list.push(candidate)
    else byCategory.set(candidate.category_id, [candidate])
  }
  const categoryId = rng.choice([...byCategory.keys()].sort((a, b) => a - b))
  return rng.choice(byCategory.get(categoryId)!)
}

/** The related word Impostors get in Similar Word mode.
 *
 * Uses the word's curated similar word; otherwise another word from the same category
 * (so it fits the category everyone is told), and as a last resort any other word. */
export function chooseImpostorWord(
  secret: WordCandidate,
  candidates: readonly WordCandidate[],
  rng: Rng = systemRng,
): string {
  const curated = (secret.similar_word ?? '').trim()
  if (curated && curated.toLowerCase() !== secret.word.toLowerCase()) return curated
  const others = candidates.filter((c) => c.word.toLowerCase() !== secret.word.toLowerCase())
  const sameCategory = others.filter((c) => c.category_id === secret.category_id)
  const pool = sameCategory.length ? sameCategory : others
  if (!pool.length) {
    throw new GameValidationError('Similar Word mode needs at least two different words.')
  }
  return rng.choice(pool).word
}
