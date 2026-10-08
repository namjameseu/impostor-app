/** Player stats across a set of locally-played games. Port of backend/app/services/stats_service.py,
 * operating over full locally-stored game records (impostor.game.<id>) instead of DB rows, since
 * that's now the only place round-level history exists. */
import type { PlayerStats, Stats } from '../types/api'
import { loadJson } from '../utils/storage'
import { rankPlayers } from './scoring'
import type { InternalGame } from './types'

const MAX_GAMES = 500

interface Totals {
  name: string
  games: Set<number>
  wins: number
  rounds: number
  points: number
  impostor_rounds: number
  escaped: number
  caught: number
  guessed_word: number
}

export async function playerStats(gameIds: number[]): Promise<Stats> {
  const ids = [...new Set(gameIds)].slice(0, MAX_GAMES)
  const games = ids
    .map((id) => loadJson<InternalGame | null>(`impostor.game.${id}`, null))
    .filter((g): g is InternalGame => g !== null)

  const totals = new Map<string, Totals>()
  const entry = (name: string): Totals => {
    const key = name.toLowerCase()
    let total = totals.get(key)
    if (!total) {
      total = {
        name,
        games: new Set(),
        wins: 0,
        rounds: 0,
        points: 0,
        impostor_rounds: 0,
        escaped: 0,
        caught: 0,
        guessed_word: 0,
      }
      totals.set(key, total)
    }
    return total
  }

  let finishedGames = 0
  for (const game of games) {
    const names = Object.fromEntries(game.players.map((p) => [p.id, p.name]))
    if (game.state === 'GAME_RESULTS') {
      finishedGames += 1
      const standings = rankPlayers(
        game.players.map((p) => ({ id: p.id, name: p.name, score: p.score, order_index: p.order_index })),
      )
      for (const standing of standings) if (standing.rank === 1) entry(standing.name).wins += 1
    }

    for (const round of game.rounds) {
      if (round.outcome === null || round.points === null) continue
      for (const [pidStr, points] of Object.entries(round.points)) {
        const player = entry(names[Number(pidStr)])
        player.games.add(game.id)
        player.rounds += 1
        player.points += points
      }
      for (const impostor of round.impostors) {
        const player = entry(names[impostor.player_id])
        player.impostor_rounds += 1
        if (round.suspect_ids.includes(impostor.player_id)) {
          player.caught += 1
          if (impostor.guessed_word) player.guessed_word += 1
        } else {
          player.escaped += 1
        }
      }
    }
  }

  const players: PlayerStats[] = [...totals.values()]
    .filter((t) => t.rounds)
    .map((t) => ({
      name: t.name,
      games: t.games.size,
      wins: t.wins,
      rounds: t.rounds,
      points: t.points,
      impostor_rounds: t.impostor_rounds,
      escaped: t.escaped,
      caught: t.caught,
      guessed_word: t.guessed_word,
    }))
  players.sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name))

  return { games: games.length, finished_games: finishedGames, players }
}
