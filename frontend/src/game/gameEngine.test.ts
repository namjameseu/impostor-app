import { describe, expect, it } from 'vitest'
import type { GameState } from '../types/api'
import { GameValidationError, InvalidStateError } from './errors'
import {
  hasMoreRounds,
  isImpostorVisible,
  isWordVisible,
  maxImpostors,
  transition,
  validateImpostorCount,
  validatePlayerNames,
} from './gameEngine'

const ALL_STATES: GameState[] = [
  'SETUP',
  'ROLE_REVEAL',
  'READY',
  'CLUE_ROUND',
  'VOTING',
  'IMPOSTOR_REVEAL',
  'FINAL_GUESS',
  'ROUND_RESULTS',
  'GAME_RESULTS',
]

const ALLOWED: Partial<Record<GameState, GameState[]>> = {
  SETUP: ['ROLE_REVEAL'],
  ROLE_REVEAL: ['READY'],
  READY: ['CLUE_ROUND'],
  CLUE_ROUND: ['VOTING'],
  VOTING: ['IMPOSTOR_REVEAL'],
  IMPOSTOR_REVEAL: ['FINAL_GUESS', 'ROUND_RESULTS'],
  FINAL_GUESS: ['ROUND_RESULTS'],
  ROUND_RESULTS: ['ROLE_REVEAL', 'GAME_RESULTS'],
  GAME_RESULTS: [],
}

describe('state machine', () => {
  it('only allows the declared transitions', () => {
    for (const current of ALL_STATES) {
      for (const target of ALL_STATES) {
        if (ALLOWED[current]?.includes(target)) {
          expect(transition(current, target)).toBe(target)
        } else {
          expect(() => transition(current, target)).toThrow(InvalidStateError)
        }
      }
    }
  })

  it('treats GAME_RESULTS as terminal', () => {
    expect(ALLOWED.GAME_RESULTS).toEqual([])
  })

  it('tracks whether more rounds remain', () => {
    expect(hasMoreRounds(2, 3)).toBe(true)
    expect(hasMoreRounds(3, 3)).toBe(false)
  })
})

describe('secret visibility by state', () => {
  const hidden: GameState[] = [
    'SETUP',
    'ROLE_REVEAL',
    'READY',
    'CLUE_ROUND',
    'VOTING',
    'IMPOSTOR_REVEAL',
  ]

  it('hides impostors and the word until the right state', () => {
    for (const state of hidden) {
      expect(isImpostorVisible(state)).toBe(false)
      expect(isWordVisible(state, true)).toBe(false)
    }
    expect(isImpostorVisible('FINAL_GUESS')).toBe(true)
    expect(isWordVisible('FINAL_GUESS', false)).toBe(false)
    expect(isWordVisible('FINAL_GUESS', true)).toBe(true)
    expect(isWordVisible('ROUND_RESULTS', false)).toBe(true)
  })
})

describe('impostor count limits', () => {
  it.each([
    [3, 1],
    [4, 1],
    [5, 2],
    [6, 2],
    [7, 3],
    [20, 9],
  ])('%i players allow at most %i Impostors', (players, limit) => {
    expect(maxImpostors(players)).toBe(limit)
    expect(() => validateImpostorCount(limit, players)).not.toThrow()
    expect(() => validateImpostorCount(limit + 1, players)).toThrow(GameValidationError)
  })
})

describe('player name validation', () => {
  it.each([
    [['Ann', 'Bob']], // too few
    [['Ann', 'Bob', ' ']], // empty
    [['Ann', 'Bob', 'ann']], // case-insensitive duplicate
    [['Ann', 'Bob', 'x'.repeat(31)]], // too long
  ])('rejects %j', (names) => {
    expect(() => validatePlayerNames(names)).toThrow(GameValidationError)
  })

  it('trims player names', () => {
    expect(validatePlayerNames(['  Ann ', 'Bob', 'Cy  Lee'])).toEqual(['Ann', 'Bob', 'Cy Lee'])
  })
})
