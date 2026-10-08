import { describe, expect, it } from 'vitest'
import { GameValidationError } from './errors'
import { chooseImpostorWord, selectWord, type WordCandidate } from './wordSelector'

function candidates(): WordCandidate[] {
  return [
    { id: 1, word: 'Penguin', category_id: 1, category_name: 'Animals', similar_word: null, hint: null },
    { id: 2, word: 'Dolphin', category_id: 1, category_name: 'Animals', similar_word: null, hint: null },
    { id: 3, word: 'Pizza', category_id: 2, category_name: 'Food', similar_word: null, hint: null },
  ]
}

describe('selectWord', () => {
  it('skips already-used words', () => {
    for (let i = 0; i < 100; i++) {
      expect(selectWord(candidates(), new Set([1, 3])).id).toBe(2)
    }
  })

  it('falls back to repeats once everything has been used', () => {
    expect([1, 2, 3]).toContain(selectWord(candidates(), new Set([1, 2, 3])).id)
  })

  it('eventually uses every word without repeating early', () => {
    const used = new Set<number>()
    for (let i = 0; i < 3; i++) used.add(selectWord(candidates(), used).id)
    expect(used).toEqual(new Set([1, 2, 3]))
  })

  it('picks a category before a word, so a 1-word category is as likely as a 2-word one', () => {
    const picks = Array.from({ length: 2000 }, () => selectWord(candidates(), new Set()).category_id)
    const foodShare = picks.filter((id) => id === 2).length / picks.length
    expect(foodShare).toBeGreaterThan(0.4)
    expect(foodShare).toBeLessThan(0.6)
  })

  it('requires at least one candidate', () => {
    expect(() => selectWord([], new Set())).toThrow(GameValidationError)
  })
})

describe('chooseImpostorWord', () => {
  it('uses the curated similar word', () => {
    const penguin: WordCandidate = {
      id: 1,
      word: 'Penguin',
      category_id: 1,
      category_name: 'Animals',
      similar_word: 'Puffin',
      hint: null,
    }
    expect(chooseImpostorWord(penguin, candidates())).toBe('Puffin')
  })

  it('falls back to the same category when there is no curated word', () => {
    const penguin: WordCandidate = {
      id: 1,
      word: 'Penguin',
      category_id: 1,
      category_name: 'Animals',
      similar_word: null,
      hint: null,
    }
    for (let i = 0; i < 50; i++) {
      expect(chooseImpostorWord(penguin, candidates())).toBe('Dolphin')
    }
  })

  it('ignores a similar word equal to the secret', () => {
    const penguin: WordCandidate = {
      id: 1,
      word: 'Penguin',
      category_id: 1,
      category_name: 'Animals',
      similar_word: 'penguin',
      hint: null,
    }
    expect(chooseImpostorWord(penguin, candidates())).toBe('Dolphin')
  })

  it('uses any other word as a last resort, and errors with none available', () => {
    const pizza: WordCandidate = {
      id: 3,
      word: 'Pizza',
      category_id: 2,
      category_name: 'Food',
      similar_word: null,
      hint: null,
    }
    expect(['Penguin', 'Dolphin']).toContain(chooseImpostorWord(pizza, candidates()))
    expect(() => chooseImpostorWord(pizza, [pizza])).toThrow(GameValidationError)
  })
})
