/** Scoring, worked out per Impostor so it generalises to any number of them.
 * Port of backend/app/game/scoring.py. */
import type { RoundOutcome } from '../types/api'

export const IMPOSTOR_ESCAPED_POINTS = 2
export const IMPOSTOR_GUESSED_POINTS = 1
export const CREW_POINTS_PER_CATCH = 1

export type ImpostorResult = 'escaped' | 'caught_guessed' | 'caught_missed'

export function impostorResult(caught: boolean, guessedWord: boolean | null): ImpostorResult {
  if (!caught) return 'escaped'
  if (guessedWord === null) {
    throw new Error("A caught Impostor's final guess must be recorded first.")
  }
  return guessedWord ? 'caught_guessed' : 'caught_missed'
}

/** Points each player earns for a round, given each Impostor's result.
 *
 * - Escaped Impostor: +2 to that Impostor.
 * - Caught Impostor who guessed the word: +1 to that Impostor.
 * - Caught Impostor who missed: +1 to every non-Impostor. */
export function roundPoints(
  playerIds: readonly number[],
  results: Record<number, ImpostorResult>,
): Record<number, number> {
  const points: Record<number, number> = Object.fromEntries(playerIds.map((id) => [id, 0]))
  const impostorIds = new Set(Object.keys(results).map(Number))
  const crew = playerIds.filter((id) => !impostorIds.has(id))
  for (const [idStr, result] of Object.entries(results)) {
    const id = Number(idStr)
    if (result === 'escaped') points[id] += IMPOSTOR_ESCAPED_POINTS
    else if (result === 'caught_guessed') points[id] += IMPOSTOR_GUESSED_POINTS
    else for (const pid of crew) points[pid] += CREW_POINTS_PER_CATCH
  }
  return points
}

/** Round summary: did the group or the Impostors come out ahead? */
export function roundOutcome(results: Record<number, ImpostorResult>): RoundOutcome {
  const values = Object.values(results)
  const missed = values.filter((r) => r === 'caught_missed').length
  if (missed === values.length) return 'group_wins'
  if (missed === 0) return 'impostors_win'
  return 'split'
}

function join(names: readonly string[]): string {
  return names.length === 1
    ? names[0]
    : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
}

/** One short sentence per kind of result, e.g. for the round-results screen. */
export function explainRound(
  results: Record<number, ImpostorResult>,
  names: Record<number, string>,
): string {
  const byResult: Record<ImpostorResult, string[]> = {
    escaped: [],
    caught_guessed: [],
    caught_missed: [],
  }
  for (const [idStr, result] of Object.entries(results)) byResult[result].push(names[Number(idStr)])

  const sentences: string[] = []
  for (const name of byResult.escaped) {
    sentences.push(`${name} escaped undetected! +${IMPOSTOR_ESCAPED_POINTS} for ${name}.`)
  }
  for (const name of byResult.caught_guessed) {
    sentences.push(`${name} was caught but guessed the word! +${IMPOSTOR_GUESSED_POINTS} for ${name}.`)
  }
  const missed = byResult.caught_missed
  if (missed.length) {
    const crewPoints = CREW_POINTS_PER_CATCH * missed.length
    const caught =
      missed.length === 1
        ? `The group caught ${missed[0]} and they missed the word.`
        : `The group caught ${join(missed)} and none of them guessed the word.`
    sentences.push(`${caught} Everyone else gets +${crewPoints}.`)
  }
  return sentences.join(' ')
}

export interface Standing {
  rank: number
  player_id: number
  name: string
  score: number
}

/** Rank players by score; ties share a rank (1, 1, 3...). */
export function rankPlayers(
  players: readonly { id: number; name: string; score: number; order_index: number }[],
): Standing[] {
  const ordered = [...players].sort((a, b) => b.score - a.score || a.order_index - b.order_index)
  const standings: Standing[] = []
  ordered.forEach((p, index) => {
    const last = standings[standings.length - 1]
    const rank = last && last.score === p.score ? last.rank : index + 1
    standings.push({ rank, player_id: p.id, name: p.name, score: p.score })
  })
  return standings
}
