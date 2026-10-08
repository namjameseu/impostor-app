import { beforeAll, describe, expect, it } from 'vitest'
import type { Game, GameSettings } from '../types/api'
import * as gameStore from './gameStore'
import { playerStats } from './stats'
import type { BankCategory } from './wordBank'

const WORD_BANK: BankCategory[] = [
  {
    id: 1,
    name: 'Animals',
    words: [
      { id: 101, word: 'Quokka', similar_word: null },
      { id: 102, word: 'Axolotl', similar_word: null },
      { id: 103, word: 'Pangolin', similar_word: null },
    ],
  },
]

beforeAll(() => {
  globalThis.fetch = (async () => ({ json: async () => WORD_BANK }) as Response) as typeof fetch
})

const NAMES = ['James', 'Lloyd', 'Sarah', 'Mark', 'Anna']

function defaultSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    total_rounds: 2,
    category_mode: 'random',
    category_ids: [],
    impostor_hint: 'category',
    impostor_count: 1,
    impostors_know_each_other: false,
    impostor_mode: 'classic',
    ...overrides,
  }
}

/** Accuse someone other than the Impostor, so the Impostor always escapes (+2). */
async function playRoundEscaped(game: Game): Promise<Game> {
  const roles: Record<number, { role: string }> = {}
  let current = game
  for (const player of current.players.filter((p) => p.active)) {
    roles[player.id] = await gameStore.getPlayerRole(current.id, player.id)
    current = await gameStore.completeReveal(current.id, player.id)
  }
  current = await gameStore.startClueRound(current.id)
  current = await gameStore.startVoting(current.id)
  const impostorId = Number(Object.entries(roles).find(([, r]) => r.role === 'impostor')![0])
  const innocent = current.players.find((p) => p.id !== impostorId)!.id
  const afterVote = await gameStore.selectSuspects(current.id, [innocent])
  return gameStore.revealImpostors(afterVote.id)
}

describe('playerStats', () => {
  it('merges players by name case-insensitively across games', async () => {
    const ids: number[] = []
    for (const players of [NAMES, NAMES.map((n) => n.toLowerCase())]) {
      const created = await gameStore.createGame(players, defaultSettings())
      let game = await gameStore.startGame(created.id)
      ids.push(game.id)
      for (let roundNumber = 1; roundNumber <= 2; roundNumber++) {
        game = await playRoundEscaped(game)
        if (roundNumber === 1) game = await gameStore.nextRound(game.id)
      }
      await gameStore.finishGame(game.id)
    }

    const stats = await playerStats(ids)
    expect(stats.games).toBe(2)
    expect(stats.finished_games).toBe(2)
    expect(stats.players).toHaveLength(5) // names merged case-insensitively

    const total = (key: keyof (typeof stats.players)[number]) =>
      stats.players.reduce((sum, p) => sum + (p[key] as number), 0)
    expect(total('rounds')).toBe(2 * 2 * 5)
    expect(total('impostor_rounds')).toBe(4)
    expect(total('escaped')).toBe(4)
    expect(total('caught')).toBe(0)
    expect(total('points')).toBe(4 * 2)
    expect(total('wins')).toBeGreaterThanOrEqual(2)
    for (const player of stats.players) expect(player.games).toBe(2)

    // Only the requested games count.
    expect((await playerStats([ids[0]])).games).toBe(1)
    expect((await playerStats([])).players).toEqual([])
  })
})
