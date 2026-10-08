import { beforeAll, describe, expect, it } from 'vitest'
import type { Game, GameSettings, PlayerRole } from '../types/api'
import { GameValidationError, InvalidStateError, NotFoundError, RoleAccessError } from './errors'
import * as gameStore from './gameStore'
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
  {
    id: 2,
    name: 'Food',
    words: [
      { id: 201, word: 'Bibingka', similar_word: null },
      { id: 202, word: 'Gnocchi', similar_word: null },
      { id: 203, word: 'Tamale', similar_word: null },
    ],
  },
  {
    id: 3,
    name: 'Places',
    words: [
      { id: 301, word: 'Zanzibar', similar_word: null },
      { id: 302, word: 'Kathmandu', similar_word: null },
      { id: 303, word: 'Reykjavik', similar_word: null },
    ],
  },
]
const ALL_WORDS = WORD_BANK.flatMap((c) => c.words.map((w) => w.word))
const CATEGORY = { Animals: 1, Food: 2, Places: 3 }

const NAMES = ['James', 'Lloyd', 'Sarah', 'Mark', 'Anna']
const SEVEN = ['James', 'Lloyd', 'Sarah', 'Mark', 'Anna', 'Ben', 'Cara']

beforeAll(() => {
  globalThis.fetch = (async () =>
    ({ json: async () => WORD_BANK }) as Response) as typeof fetch
})

function assertNoSecretWord(payload: unknown): void {
  const text = JSON.stringify(payload)
  for (const word of ALL_WORDS) expect(text).not.toContain(word)
}

function defaultSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    total_rounds: 1,
    category_mode: 'random',
    category_ids: [],
    impostor_hint: 'category',
    impostor_count: 1,
    impostors_know_each_other: false,
    impostor_mode: 'classic',
    ...overrides,
  }
}

async function createGame(names = NAMES, overrides: Partial<GameSettings> = {}): Promise<Game> {
  return gameStore.createGame(names, defaultSettings(overrides))
}

async function start(gameId: number): Promise<Game> {
  return gameStore.startGame(gameId)
}

/** Walk through role reveal. Returns (game, {player_id: role}). */
async function revealAllRoles(game: Game): Promise<{ game: Game; roles: Record<number, PlayerRole> }> {
  const roles: Record<number, PlayerRole> = {}
  let current = game
  for (const player of current.players.filter((p) => p.active)) {
    expect(current.round?.revealer_id).toBe(player.id)
    roles[player.id] = await gameStore.getPlayerRole(current.id, player.id)
    current = await gameStore.completeReveal(current.id, player.id)
  }
  return { game: current, roles }
}

async function playToVoting(
  game: Game,
): Promise<{ game: Game; roles: Record<number, PlayerRole>; impostorId: number }> {
  const { game: afterReveal, roles } = await revealAllRoles(game)
  expect(afterReveal.state).toBe('READY')
  const clueing = await gameStore.startClueRound(afterReveal.id)
  expect(clueing.state).toBe('CLUE_ROUND')
  const voting = await gameStore.startVoting(clueing.id)
  expect(voting.state).toBe('VOTING')
  const impostorId = Number(Object.entries(roles).find(([, r]) => r.role === 'impostor')![0])
  return { game: voting, roles, impostorId }
}

async function voteAndReveal(game: Game, suspects: number | number[]): Promise<Game> {
  const ids = Array.isArray(suspects) ? suspects : [suspects]
  const afterVote = await gameStore.selectSuspects(game.id, ids)
  expect(afterVote.state).toBe('IMPOSTOR_REVEAL')
  return gameStore.revealImpostors(game.id)
}

async function playRoundEscaped(game: Game): Promise<Game> {
  const { game: voting, impostorId } = await playToVoting(game)
  const innocent = voting.players.find((p) => p.id !== impostorId)!.id
  return voteAndReveal(voting, innocent)
}

function rolesByKind(roles: Record<number, PlayerRole>): { impostors: number[]; crew: number[] } {
  const impostors = Object.entries(roles)
    .filter(([, r]) => r.role === 'impostor')
    .map(([id]) => Number(id))
  const crew = Object.entries(roles)
    .filter(([, r]) => r.role === 'player')
    .map(([id]) => Number(id))
  return { impostors, crew }
}

// --- Role reveal & secrecy ------------------------------------------------

describe('role reveal and secrecy', () => {
  it('has exactly one Impostor and everyone else shares the word', async () => {
    const game = await start((await createGame()).id)
    const { roles } = await revealAllRoles(game)
    const impostors = Object.values(roles).filter((r) => r.role === 'impostor')
    const players = Object.values(roles).filter((r) => r.role === 'player')
    expect(impostors).toHaveLength(1)
    expect(new Set(players.map((r) => (r as { word: string }).word)).size).toBe(1)
    expect(ALL_WORDS).toContain((players[0] as { word: string }).word)
  })

  it.each(['category', 'none'] as const)(
    "never puts the word in the Impostor's role (hint=%s)",
    async (hint) => {
      const game = await start((await createGame(NAMES, { impostor_hint: hint })).id)
      const { roles } = await revealAllRoles(game)
      const impostorRole = Object.values(roles).find((r) => r.role === 'impostor')!
      expect('word' in impostorRole).toBe(false)
      assertNoSecretWord(impostorRole)
      if (hint === 'none') expect(impostorRole).toEqual({ role: 'impostor' })
      else expect(Object.keys(impostorRole).sort()).toEqual(['category', 'role'])
    },
  )

  it('hides secrets from the public game view until reveal', async () => {
    const created = await createGame()
    let game = await start(created.id)
    assertNoSecretWord(game)
    expect(game.round?.impostor_ids).toBeNull()

    const { game: voting, impostorId } = await playToVoting(game)
    assertNoSecretWord(await gameStore.getGame(voting.id))

    const suspect = voting.players.find((p) => p.id !== impostorId)!.id
    game = await gameStore.selectSuspects(voting.id, [suspect])
    const fetched = await gameStore.getGame(game.id)
    assertNoSecretWord(fetched)
    expect(fetched.round?.impostor_ids).toBeNull()
    expect(fetched.round?.category).toBeNull()
  })

  it('refuses to show or complete another player\'s role', async () => {
    const game = await start((await createGame()).id)
    const second = game.players[1].id
    await expect(gameStore.getPlayerRole(game.id, second)).rejects.toBeInstanceOf(RoleAccessError)
    await expect(gameStore.completeReveal(game.id, second)).rejects.toBeInstanceOf(RoleAccessError)
  })

  it('refuses to show a role again after completing it', async () => {
    const game = await start((await createGame()).id)
    const first = game.players[0].id
    await gameStore.completeReveal(game.id, first)
    await expect(gameStore.getPlayerRole(game.id, first)).rejects.toBeInstanceOf(RoleAccessError)
  })

  it('refuses roles once the reveal phase has ended', async () => {
    const game = await start((await createGame()).id)
    const { game: voting } = await playToVoting(game)
    await expect(
      gameStore.getPlayerRole(voting.id, voting.players[0].id),
    ).rejects.toBeInstanceOf(InvalidStateError)
  })
})

// --- Scoring ---------------------------------------------------------------

describe('scoring through a round', () => {
  it('gives the group a point each when the caught Impostor misses the word', async () => {
    const created = await createGame()
    const { game: voting, roles, impostorId } = await playToVoting(await start(created.id))
    let game = await voteAndReveal(voting, impostorId)

    expect(game.state).toBe('FINAL_GUESS')
    expect(game.round?.impostor_ids).toEqual([impostorId])
    expect(game.round?.caught_impostor_ids).toEqual([impostorId])
    expect(game.round?.secret_word).toBeNull()

    game = await gameStore.revealWord(game.id)
    const word = Object.values(roles).find((r) => r.role === 'player') as { word: string }
    expect(game.round?.secret_word).toBe(word.word)

    game = await gameStore.recordFinalGuess(game.id, [])
    expect(game.state).toBe('ROUND_RESULTS')
    expect(game.round?.outcome).toBe('group_wins')
    const scores = Object.fromEntries(game.players.map((p) => [p.id, p.score]))
    expect(scores[impostorId]).toBe(0)
    expect(Object.entries(scores).every(([id, s]) => Number(id) === impostorId || s === 1)).toBe(true)
    expect(game.round?.explanation).toBeTruthy()
  })

  it('gives the caught Impostor one point for guessing the word', async () => {
    const created = await createGame()
    const { game: voting, impostorId } = await playToVoting(await start(created.id))
    let game = await voteAndReveal(voting, impostorId)
    await gameStore.revealWord(game.id)
    game = await gameStore.recordFinalGuess(game.id, [impostorId])

    expect(game.round?.outcome).toBe('impostors_win')
    expect(game.round?.guessed_word_ids).toEqual([impostorId])
    const scores = Object.fromEntries(game.players.map((p) => [p.id, p.score]))
    for (const [id, score] of Object.entries(scores)) {
      expect(score).toBe(Number(id) === impostorId ? 1 : 0)
    }
  })

  it('gives an escaped Impostor two points', async () => {
    const created = await createGame()
    const { game: voting, impostorId } = await playToVoting(await start(created.id))
    const innocent = voting.players.find((p) => p.id !== impostorId)!.id
    const game = await voteAndReveal(voting, innocent)

    expect(game.state).toBe('ROUND_RESULTS')
    expect(game.round?.caught_impostor_ids).toEqual([])
    expect(game.round?.outcome).toBe('impostors_win')
    expect(ALL_WORDS).toContain(game.round?.secret_word)
    const scores = Object.fromEntries(game.players.map((p) => [p.id, p.score]))
    for (const [id, score] of Object.entries(scores)) {
      expect(score).toBe(Number(id) === impostorId ? 2 : 0)
    }
  })
})

// --- Full game progression --------------------------------------------------

describe('full game progression', () => {
  it('runs to completion and supports play again', async () => {
    const created = await createGame(NAMES, { total_rounds: 3 })
    let game = await start(created.id)
    for (let roundNumber = 1; roundNumber <= 3; roundNumber++) {
      expect(game.round?.round_number).toBe(roundNumber)
      game = await playRoundEscaped(game)
      if (roundNumber < 3) {
        await expect(gameStore.finishGame(game.id)).rejects.toBeInstanceOf(InvalidStateError)
        game = await gameStore.nextRound(game.id)
      }
    }
    await expect(gameStore.nextRound(game.id)).rejects.toBeInstanceOf(InvalidStateError)
    game = await gameStore.finishGame(game.id)
    expect(game.state).toBe('GAME_RESULTS')
    expect(game.players.reduce((sum, p) => sum + p.score, 0)).toBe(6)

    const results = await gameStore.getResults(game.id)
    expect(results.rounds.map((r) => r.round_number)).toEqual([1, 2, 3])
    const scores = results.standings.map((s) => s.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))

    const again = await gameStore.playAgain(game.id)
    expect(again.id).not.toBe(game.id)
    expect(again.state).toBe('SETUP')
    expect(again.players.map((p) => p.name)).toEqual(NAMES)
    expect(again.players.every((p) => p.score === 0)).toBe(true)
    expect(again.settings.total_rounds).toBe(3)
  })

  it('does not repeat words while others remain available', async () => {
    const created = await createGame(NAMES, {
      total_rounds: 3,
      category_mode: 'specific',
      category_ids: [CATEGORY.Animals],
    })
    let game = await start(created.id)
    const words: (string | null | undefined)[] = []
    for (let roundNumber = 1; roundNumber <= 3; roundNumber++) {
      game = await playRoundEscaped(game)
      words.push(game.round?.secret_word)
      expect(game.round?.category).toBe('Animals')
      if (roundNumber < 3) game = await gameStore.nextRound(game.id)
    }
    expect([...words].sort()).toEqual(['Axolotl', 'Pangolin', 'Quokka'].sort())
  })

  it('only uses the selected categories when mixing several', async () => {
    const created = await createGame(NAMES, {
      total_rounds: 6,
      category_mode: 'specific',
      category_ids: [CATEGORY.Animals, CATEGORY.Places],
    })
    expect(new Set(created.settings.categories.map((c) => c.name))).toEqual(new Set(['Animals', 'Places']))
    let game = await start(created.id)
    const seen: [string | null | undefined, string | null | undefined][] = []
    for (let roundNumber = 1; roundNumber <= 6; roundNumber++) {
      game = await playRoundEscaped(game)
      seen.push([game.round?.category, game.round?.secret_word])
      if (roundNumber < 6) game = await gameStore.nextRound(game.id)
    }
    expect(new Set(seen.map(([cat]) => cat))).toEqual(new Set(['Animals', 'Places']))
    expect([...seen.map(([, w]) => w)].sort()).toEqual(
      [...WORD_BANK[0].words, ...WORD_BANK[2].words].map((w) => w.word).sort(),
    )
  })

  it('uses every category in random mode', async () => {
    const created = await createGame(NAMES, { total_rounds: 9 })
    expect(created.settings.category_mode).toBe('random')
    expect(created.settings.categories).toEqual([])
    let game = await start(created.id)
    const categories = new Set<string | null | undefined>()
    for (let roundNumber = 1; roundNumber <= 9; roundNumber++) {
      game = await playRoundEscaped(game)
      categories.add(game.round?.category)
      if (roundNumber < 9) game = await gameStore.nextRound(game.id)
    }
    expect(categories).toEqual(new Set(['Animals', 'Food', 'Places']))
  })
})

// --- Invalid state transitions ---------------------------------------------

describe('invalid state transitions are rejected', () => {
  it('rejects voting during role reveal', async () => {
    const game = await start((await createGame()).id)
    await expect(
      gameStore.selectSuspects(game.id, [game.players[0].id]),
    ).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('rejects starting the next round during voting', async () => {
    const game = await start((await createGame()).id)
    const { game: voting } = await playToVoting(game)
    await expect(gameStore.nextRound(voting.id)).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('rejects changing the suspect after the reveal', async () => {
    const game = await start((await createGame()).id)
    const { game: voting, impostorId } = await playToVoting(game)
    const revealed = await voteAndReveal(voting, impostorId)
    const other = revealed.players.find((p) => p.id !== impostorId)!.id
    await expect(gameStore.selectSuspects(revealed.id, [other])).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('requires the word to be revealed before a final guess', async () => {
    const game = await start((await createGame()).id)
    const { game: voting, impostorId } = await playToVoting(game)
    const revealed = await voteAndReveal(voting, impostorId)
    await expect(gameStore.recordFinalGuess(revealed.id, [impostorId])).rejects.toBeInstanceOf(
      InvalidStateError,
    )
  })

  it('cannot skip ahead or start twice', async () => {
    const created = await createGame()
    await expect(gameStore.startVoting(created.id)).rejects.toBeInstanceOf(InvalidStateError)
    const game = await start(created.id)
    await expect(gameStore.startGame(game.id)).rejects.toBeInstanceOf(InvalidStateError)
    await expect(gameStore.startClueRound(game.id)).rejects.toBeInstanceOf(InvalidStateError)
    await expect(gameStore.revealImpostors(game.id)).rejects.toBeInstanceOf(InvalidStateError)
  })
})

// --- Setup validation --------------------------------------------------------

describe('game setup validation', () => {
  it('rejects too few or duplicate players', async () => {
    await expect(createGame(['A', 'B'])).rejects.toBeInstanceOf(GameValidationError)
    await expect(createGame(['A', 'B', 'a'])).rejects.toBeInstanceOf(GameValidationError)
  })

  it('rejects a category that no longer exists', async () => {
    await expect(createGame(NAMES, { category_mode: 'specific', category_ids: [999] })).rejects.toBeInstanceOf(
      GameValidationError,
    )
  })
})

// --- Multiple Impostors ------------------------------------------------------

describe('multiple Impostors', () => {
  it('limits the Impostor count by player count', async () => {
    await expect(createGame(NAMES, { impostor_count: 3 })).rejects.toBeInstanceOf(GameValidationError)
    await expect(createGame(NAMES.slice(0, 4), { impostor_count: 2 })).rejects.toBeInstanceOf(
      GameValidationError,
    )
    const game = await createGame(NAMES, { impostor_count: 2 })
    expect(game.settings.impostor_count).toBe(2)
  })

  it('gives every Impostor a role and no word', async () => {
    const game = await start((await createGame(SEVEN, { impostor_count: 3 })).id)
    const { roles } = await revealAllRoles(game)
    const impostors = Object.values(roles).filter((r) => r.role === 'impostor')
    expect(impostors).toHaveLength(3)
    expect(impostors.every((r) => !('word' in r))).toBe(true)
    assertNoSecretWord(impostors)
    const words = Object.values(roles)
      .filter((r) => r.role === 'player')
      .map((r) => (r as { word: string }).word)
    expect(new Set(words).size).toBe(1)
  })

  it('requires exactly one suspect per Impostor', async () => {
    const game = await start((await createGame(SEVEN, { impostor_count: 2 })).id)
    const { game: voting } = await playToVoting(game)
    const ids = voting.players.map((p) => p.id)
    await expect(gameStore.selectSuspects(voting.id, ids.slice(0, 1))).rejects.toBeInstanceOf(
      GameValidationError,
    )
    await expect(gameStore.selectSuspects(voting.id, ids.slice(0, 3))).rejects.toBeInstanceOf(
      GameValidationError,
    )
    await expect(gameStore.selectSuspects(voting.id, [ids[0], ids[0]])).rejects.toBeInstanceOf(
      GameValidationError,
    )
    await expect(gameStore.selectSuspects(voting.id, [ids[0], 99999])).rejects.toBeInstanceOf(NotFoundError)
    await expect(gameStore.selectSuspects(voting.id, ids.slice(0, 2))).resolves.toBeTruthy()
  })

  it('scores a split round per Impostor', async () => {
    const game = await start((await createGame(SEVEN, { impostor_count: 2 })).id)
    const { game: voting, roles } = await playToVoting(game)
    const { impostors, crew } = rolesByKind(roles)
    const [caught, escaped] = impostors

    let result = await voteAndReveal(voting, [caught, crew[0]])
    expect(result.state).toBe('FINAL_GUESS')
    expect([...(result.round?.impostor_ids ?? [])].sort()).toEqual([caught, escaped].sort())
    expect(result.round?.caught_impostor_ids).toEqual([caught])

    await gameStore.revealWord(result.id)
    await expect(gameStore.recordFinalGuess(result.id, [escaped])).rejects.toBeInstanceOf(
      GameValidationError,
    )
    result = await gameStore.recordFinalGuess(result.id, [])

    expect(result.round?.outcome).toBe('split')
    const scores = Object.fromEntries(result.players.map((p) => [p.id, p.score]))
    expect(scores[escaped]).toBe(2)
    expect(scores[caught]).toBe(0)
    for (const pid of crew) expect(scores[pid]).toBe(1)
    expect(result.round?.explanation).toContain('escaped')
  })

  it('gives the crew a point each when every Impostor is caught and misses', async () => {
    const game = await start((await createGame(SEVEN, { impostor_count: 2 })).id)
    const { game: voting, roles } = await playToVoting(game)
    const { impostors, crew } = rolesByKind(roles)
    let result = await voteAndReveal(voting, impostors)
    expect([...(result.round?.caught_impostor_ids ?? [])].sort()).toEqual([...impostors].sort())
    await gameStore.revealWord(result.id)
    const [guessed, missed] = impostors
    result = await gameStore.recordFinalGuess(result.id, [guessed])

    const scores = Object.fromEntries(result.players.map((p) => [p.id, p.score]))
    expect(scores[guessed]).toBe(1)
    expect(scores[missed]).toBe(0)
    for (const pid of crew) expect(scores[pid]).toBe(1)
    expect(result.round?.guessed_word_ids).toEqual([guessed])
  })

  it('skips the final guess when nobody is caught', async () => {
    const game = await start((await createGame(SEVEN, { impostor_count: 2 })).id)
    const { game: voting, roles } = await playToVoting(game)
    const { impostors, crew } = rolesByKind(roles)
    const result = await voteAndReveal(voting, crew.slice(0, 2))
    expect(result.state).toBe('ROUND_RESULTS')
    expect(result.round?.outcome).toBe('impostors_win')
    const scores = Object.fromEntries(result.players.map((p) => [p.id, p.score]))
    for (const pid of impostors) expect(scores[pid]).toBe(2)
    for (const pid of crew) expect(scores[pid]).toBe(0)
  })

  it.each([true, false])('respects the impostors-know-each-other option (%s)', async (knowEachOther) => {
    const created = await createGame(SEVEN, { impostor_count: 3, impostors_know_each_other: knowEachOther })
    expect(created.settings.impostors_know_each_other).toBe(knowEachOther)
    const game = await start(created.id)
    const names = Object.fromEntries(game.players.map((p) => [p.id, p.name]))
    const { game: afterReveal, roles } = await revealAllRoles(game)
    const { impostors, crew } = rolesByKind(roles)

    for (const pid of impostors) {
      const role = roles[pid] as { fellow_impostors?: string[] }
      if (knowEachOther) {
        const expected = impostors.filter((id) => id !== pid).map((id) => names[id])
        expect([...(role.fellow_impostors ?? [])].sort()).toEqual([...expected].sort())
      } else {
        expect(role.fellow_impostors).toBeUndefined()
      }
    }
    for (const pid of crew) expect((roles[pid] as { fellow_impostors?: string[] }).fellow_impostors).toBeUndefined()
    expect(afterReveal.round?.impostor_ids).toBeNull()
  })

  it('gives a single Impostor no fellows even with the option on', async () => {
    const game = await start((await createGame(NAMES, { impostors_know_each_other: true })).id)
    const { roles } = await revealAllRoles(game)
    const impostorRole = Object.values(roles).find((r) => r.role === 'impostor') as {
      fellow_impostors?: string[]
    }
    expect(impostorRole.fellow_impostors).toBeUndefined()
  })
})

// --- Players joining/leaving between rounds ---------------------------------

describe('players joining and leaving between rounds', () => {
  it('keeps a finished round\'s points fixed when a player leaves', async () => {
    const created = await createGame(NAMES, { total_rounds: 3 })
    let game = await playRoundEscaped(await start(created.id))
    const leaver = game.players[1]
    const scoresBefore = Object.fromEntries(game.players.map((p) => [p.id, p.score]))

    game = await gameStore.removePlayer(game.id, leaver.id)
    const left = game.players.find((p) => p.id === leaver.id)!
    expect(left.active).toBe(false)
    expect(left.score).toBe(scoresBefore[leaver.id])
    expect(game.round?.points).toEqual(scoresBefore)

    game = await gameStore.nextRound(game.id)
    const { roles } = await revealAllRoles(game)
    expect(leaver.id in roles).toBe(false)
    expect(Object.keys(roles)).toHaveLength(4)
  })

  it('lets a late player join with zero points for past rounds', async () => {
    const created = await createGame(NAMES.slice(0, 3), { total_rounds: 3 })
    let game = await playRoundEscaped(await start(created.id))
    const firstRoundPoints = game.round?.points

    game = await gameStore.addPlayer(game.id, 'Zoe')
    const zoe = game.players.find((p) => p.name === 'Zoe')!
    expect(zoe.score).toBe(0)
    expect(zoe.active).toBe(true)
    expect(game.round?.points).toEqual(firstRoundPoints)

    game = await gameStore.nextRound(game.id)
    const { roles } = await revealAllRoles(game)
    expect(zoe.id in roles).toBe(true)
  })

  it('rejects dropping below the minimum player count', async () => {
    const game = await createGame(NAMES.slice(0, 3))
    await expect(gameStore.removePlayer(game.id, game.players[0].id)).rejects.toBeInstanceOf(
      GameValidationError,
    )
  })

  it('drops the Impostor count that no longer fits after someone leaves', async () => {
    const created = await createGame(SEVEN, { impostor_count: 3, total_rounds: 2 })
    let game = await start(created.id)
    const { game: voting } = await playToVoting(game)
    game = await voteAndReveal(voting, voting.players.slice(0, 3).map((p) => p.id))
    if (game.state === 'FINAL_GUESS') {
      await gameStore.revealWord(game.id)
      game = await gameStore.recordFinalGuess(game.id, [])
    }
    expect(game.state).toBe('ROUND_RESULTS')

    const leaver = game.players[0]
    game = await gameStore.removePlayer(game.id, leaver.id)
    expect(game.settings.impostor_count).toBe(2)
  })

  it('skips players who left when playing again', async () => {
    const created = await createGame(NAMES, { total_rounds: 1 })
    let game = await playRoundEscaped(await start(created.id))
    game = await gameStore.removePlayer(game.id, game.players[0].id)
    game = await gameStore.finishGame(game.id)
    const again = await gameStore.playAgain(game.id)
    expect(again.players.map((p) => p.name)).toEqual(NAMES.slice(1))
  })
})

// --- Similar Word mode -------------------------------------------------------

describe('Similar Word mode', () => {
  it("gives the Impostor a related word shaped like a normal player's role", async () => {
    const created = await createGame(NAMES, {
      impostor_mode: 'similar_word',
      impostors_know_each_other: true, // ignored in this mode
      category_mode: 'specific',
      category_ids: [CATEGORY.Animals],
    })
    expect(created.settings.impostor_mode).toBe('similar_word')
    expect(created.settings.impostors_know_each_other).toBe(false)
    let game = await start(created.id)

    const { roles } = await revealAllRoles(game)
    expect(
      Object.values(roles).every(
        (r) => r.role === 'player' && Object.keys(r).sort().join(',') === 'category,role,word',
      ),
    ).toBe(true)
    const words = Object.values(roles).map((r) => (r as { word: string }).word)
    const secret = [...new Set(words)].sort((a, b) => words.filter((w) => w === b).length - words.filter((w) => w === a).length)[0]
    const impostorWords = words.filter((w) => w !== secret)
    expect(impostorWords).toHaveLength(1)
    expect(game.round?.impostor_word).toBeNull()

    const impostorId = Number(Object.entries(roles).find(([, r]) => (r as { word: string }).word !== secret)![0])
    await gameStore.startClueRound(game.id)
    game = await gameStore.startVoting(game.id)
    const innocent = game.players.find((p) => p.id !== impostorId)!.id
    game = await voteAndReveal(game, innocent)
    expect(game.round?.secret_word).toBe(secret)
    expect(game.round?.impostor_word).toBe(impostorWords[0])
    expect(game.round?.impostor_ids).toEqual([impostorId])
  })
})
