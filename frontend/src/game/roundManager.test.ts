import { describe, expect, it } from 'vitest'
import { buildRoleView, chooseImpostors, chooseStartingPlayer } from './roundManager'

const PLAYERS = [10, 11, 12, 13, 14]

describe('chooseImpostors', () => {
  it('always picks one of the players', () => {
    for (let i = 0; i < 200; i++) {
      expect(PLAYERS).toContain(chooseImpostors(PLAYERS, 1)[0])
    }
  })

  it('never repeats the previous round exactly', () => {
    let previous: number[] = []
    for (let i = 0; i < 500; i++) {
      const impostors = chooseImpostors(PLAYERS, 1, previous)
      expect(impostors).not.toEqual(previous)
      previous = impostors
    }
  })

  it('reaches every other player over many rounds', () => {
    const picks = new Set<number>()
    for (let i = 0; i < 500; i++) picks.add(chooseImpostors(PLAYERS, 1, [10])[0])
    expect(picks).toEqual(new Set([11, 12, 13, 14]))
  })

  it('keeps multiple Impostors distinct and avoids last round', () => {
    for (let i = 0; i < 300; i++) {
      const picks = chooseImpostors(PLAYERS, 2, [10, 11])
      expect(new Set(picks).size).toBe(2)
      expect(picks).not.toContain(10)
      expect(picks).not.toContain(11)
    }
  })

  it('repeats only when not enough fresh players exist', () => {
    // 5 players, 3 Impostors, 3 were Impostors last round: only 2 fresh players exist.
    const picks = chooseImpostors(PLAYERS, 3, [10, 11, 12])
    expect(picks).toContain(13)
    expect(picks).toContain(14)
    expect(new Set(picks).size).toBe(3)
  })

  it.each([0, 5])('rejects a count that leaves no non-Impostor (%i)', (count) => {
    expect(() => chooseImpostors(PLAYERS, count)).toThrow()
  })
})

describe('chooseStartingPlayer', () => {
  it('covers every player over many rounds', () => {
    const picks = new Set<number>()
    for (let i = 0; i < 500; i++) picks.add(chooseStartingPlayer(PLAYERS))
    expect(picks).toEqual(new Set(PLAYERS))
  })
})

describe('buildRoleView', () => {
  it('shows a normal player the word and category', () => {
    const view = buildRoleView({
      isImpostor: false,
      secretWord: 'Penguin',
      category: 'Animals',
      impostorHint: 'none',
    })
    expect(view).toEqual({ role: 'player', category: 'Animals', word: 'Penguin' })
  })

  it.each(['none', 'category'] as const)('never gives the Impostor the secret word (hint=%s)', (hint) => {
    const view = buildRoleView({
      isImpostor: true,
      secretWord: 'Penguin',
      category: 'Animals',
      impostorHint: hint,
    })
    expect(view.word).toBeUndefined()
    expect(JSON.stringify(view)).not.toContain('Penguin')
  })

  it('only shows the category hint when impostorHint is category', () => {
    const withHint = buildRoleView({
      isImpostor: true,
      secretWord: 'Penguin',
      category: 'Animals',
      impostorHint: 'category',
    })
    const without = buildRoleView({
      isImpostor: true,
      secretWord: 'Penguin',
      category: 'Animals',
      impostorHint: 'none',
    })
    expect(withHint).toEqual({ role: 'impostor', category: 'Animals', fellow_impostors: undefined })
    expect(without.category).toBeUndefined()
  })

  it('only gives fellow Impostors to an Impostor', () => {
    const crew = buildRoleView({
      isImpostor: false,
      secretWord: 'Penguin',
      category: 'Animals',
      impostorHint: 'category',
      fellowImpostors: ['Mark'],
    })
    expect(crew.fellow_impostors).toBeUndefined()

    const impostor = buildRoleView({
      isImpostor: true,
      secretWord: 'Penguin',
      category: 'Animals',
      impostorHint: 'none',
      fellowImpostors: ['Mark'],
    })
    expect(impostor).toEqual({ role: 'impostor', category: undefined, fellow_impostors: ['Mark'] })
  })

  it('shapes a Similar Word mode Impostor like a normal player', () => {
    const impostor = buildRoleView({
      isImpostor: true,
      secretWord: 'Penguin',
      category: 'Animals',
      impostorHint: 'none',
      fellowImpostors: ['Mark'],
      impostorWord: 'Puffin',
    })
    const crew = buildRoleView({
      isImpostor: false,
      secretWord: 'Penguin',
      category: 'Animals',
      impostorHint: 'none',
    })
    expect(impostor).toEqual({ role: 'player', category: 'Animals', word: 'Puffin' })
    expect(Object.keys(impostor).sort()).toEqual(Object.keys(crew).sort())
  })
})
