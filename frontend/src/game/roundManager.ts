/** Impostor/starting-player selection and private role visibility for a round.
 * Port of backend/app/game/round_manager.py. */
import type { ImpostorHint } from '../types/api'
import { systemRng, type Rng } from './random'

/** Pick `count` Impostors, avoiding last round's Impostors wherever possible. */
export function chooseImpostors(
  playerIds: readonly number[],
  count: number,
  previousImpostorIds: readonly number[] = [],
  rng: Rng = systemRng,
): number[] {
  if (!(count >= 1 && count < playerIds.length)) {
    throw new Error('There must be at least one Impostor and at least one other player.')
  }
  const fresh = playerIds.filter((id) => !previousImpostorIds.includes(id))
  if (fresh.length >= count) return rng.sample(fresh, count)
  const repeats = playerIds.filter((id) => previousImpostorIds.includes(id))
  return [...fresh, ...rng.sample(repeats, count - fresh.length)]
}

/** Pick who gives the first clue. Always random, so it reveals nothing about the Impostor. */
export function chooseStartingPlayer(playerIds: readonly number[], rng: Rng = systemRng): number {
  return rng.choice(playerIds)
}

export interface RoleView {
  role: 'player' | 'impostor'
  category?: string
  word?: string
  /** A single loosely-associated word, shown in "Word hint" mode. */
  hint?: string
  /** Other Impostors' names; only ever given to an Impostor. */
  fellow_impostors?: string[]
}

/** The only place a player's private role is assembled. The Impostor never gets the word.
 *
 * `fellowImpostors` is only ever given to an Impostor. With `impostorWord` (Similar Word mode)
 * an Impostor's role is shaped exactly like a normal player's, carrying the related word, so
 * neither the screen nor the response gives them away. */
export function buildRoleView(opts: {
  isImpostor: boolean
  secretWord: string
  category: string
  impostorHint: ImpostorHint
  wordHint?: string | null
  fellowImpostors?: string[]
  impostorWord?: string | null
}): RoleView {
  const { isImpostor, secretWord, category, impostorHint, wordHint, fellowImpostors, impostorWord } = opts
  if (isImpostor && impostorWord != null) {
    return { role: 'player', category, word: impostorWord }
  }
  if (isImpostor) {
    const view: RoleView = { role: 'impostor' }
    if (impostorHint === 'category') view.category = category
    if (impostorHint === 'word_hint' && wordHint) view.hint = wordHint
    if (fellowImpostors !== undefined) view.fellow_impostors = fellowImpostors
    return view
  }
  return { role: 'player', category, word: secretWord }
}
