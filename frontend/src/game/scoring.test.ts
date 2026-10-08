import { describe, expect, it } from 'vitest'
import {
  explainRound,
  impostorResult,
  rankPlayers,
  roundOutcome,
  roundPoints,
  type ImpostorResult,
} from './scoring'

const PLAYERS = [10, 11, 12, 13, 14]
const ESCAPED: ImpostorResult = 'escaped'
const GUESSED: ImpostorResult = 'caught_guessed'
const MISSED: ImpostorResult = 'caught_missed'

describe('impostorResult', () => {
  it('maps caught/guessed combinations', () => {
    expect(impostorResult(false, null)).toBe(ESCAPED)
    expect(impostorResult(true, false)).toBe(MISSED)
    expect(impostorResult(true, true)).toBe(GUESSED)
    expect(() => impostorResult(true, null)).toThrow()
  })
})

describe('roundPoints / roundOutcome', () => {
  it('gives every non-Impostor one point when the group wins', () => {
    const points = roundPoints(PLAYERS, { 12: MISSED })
    expect(points).toEqual({ 10: 1, 11: 1, 12: 0, 13: 1, 14: 1 })
    expect(roundOutcome({ 12: MISSED })).toBe('group_wins')
  })

  it('gives an escaped Impostor two points', () => {
    expect(roundPoints(PLAYERS, { 12: ESCAPED })).toEqual({ 10: 0, 11: 0, 12: 2, 13: 0, 14: 0 })
    expect(roundOutcome({ 12: ESCAPED })).toBe('impostors_win')
  })

  it('gives a caught Impostor who guesses the word one point', () => {
    expect(roundPoints(PLAYERS, { 12: GUESSED })).toEqual({ 10: 0, 11: 0, 12: 1, 13: 0, 14: 0 })
    expect(roundOutcome({ 12: GUESSED })).toBe('impostors_win')
  })

  it('adds points up per Impostor', () => {
    expect(roundPoints(PLAYERS, { 12: MISSED, 13: MISSED })).toEqual({
      10: 2,
      11: 2,
      12: 0,
      13: 0,
      14: 2,
    })
    expect(roundPoints(PLAYERS, { 12: ESCAPED, 13: MISSED })).toEqual({
      10: 1,
      11: 1,
      12: 2,
      13: 0,
      14: 1,
    })
    expect(roundOutcome({ 12: ESCAPED, 13: MISSED })).toBe('split')
  })
})

describe('explainRound', () => {
  it('names each Impostor', () => {
    const names = { 12: 'Sarah', 13: 'Mark', 14: 'Anna' }
    const text = explainRound({ 12: ESCAPED, 13: MISSED, 14: MISSED }, names)
    expect(text).toContain('Sarah escaped')
    expect(text).toContain('Mark and Anna')
    expect(text).toContain('+2')
  })
})

describe('rankPlayers', () => {
  it('sorts by score and shares ties', () => {
    const standings = rankPlayers([
      { id: 1, name: 'A', score: 3, order_index: 0 },
      { id: 2, name: 'B', score: 7, order_index: 1 },
      { id: 3, name: 'C', score: 3, order_index: 2 },
      { id: 4, name: 'D', score: 1, order_index: 3 },
    ])
    expect(standings.map((s) => [s.name, s.rank])).toEqual([
      ['B', 1],
      ['A', 2],
      ['C', 2],
      ['D', 4],
    ])
  })
})
