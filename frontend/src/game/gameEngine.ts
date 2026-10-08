/** Game state machine and player-list rules. Pure logic, no storage. Port of
 * backend/app/game/game_engine.py — keep in sync if that file's rules change. */
import type { GameState } from '../types/api'
import { GameValidationError, InvalidStateError } from './errors'

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 20
export const MAX_NAME_LENGTH = 30

const TRANSITIONS: Record<GameState, readonly GameState[]> = {
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

// States in which the current round's Impostor identity may be shown.
const IMPOSTOR_VISIBLE_STATES: readonly GameState[] = ['FINAL_GUESS', 'ROUND_RESULTS', 'GAME_RESULTS']
// States in which the current round's secret word may always be shown
// (during FINAL_GUESS it is shown only after the explicit word reveal).
const WORD_VISIBLE_STATES: readonly GameState[] = ['ROUND_RESULTS', 'GAME_RESULTS']

export function requireState(current: GameState, allowed: readonly GameState[], action: string): void {
  if (!allowed.includes(current)) {
    throw new InvalidStateError(`Cannot ${action} while the game is in ${current}.`)
  }
}

export function transition(current: GameState, target: GameState): GameState {
  if (!TRANSITIONS[current].includes(target)) {
    throw new InvalidStateError(`Cannot move from ${current} to ${target}.`)
  }
  return target
}

export function hasMoreRounds(currentRoundNumber: number, totalRounds: number): boolean {
  return currentRoundNumber < totalRounds
}

export function isWordVisible(state: GameState, wordRevealed: boolean): boolean {
  return WORD_VISIBLE_STATES.includes(state) || (state === 'FINAL_GUESS' && wordRevealed)
}

export function isImpostorVisible(state: GameState): boolean {
  return IMPOSTOR_VISIBLE_STATES.includes(state)
}

/** Impostors must always be outnumbered: 1 for 3-4 players, 2 for 5-6, 3 for 7-8... */
export function maxImpostors(playerCount: number): number {
  return Math.max(1, Math.floor((playerCount - 1) / 2))
}

export function validateImpostorCount(impostorCount: number, playerCount: number): void {
  const limit = maxImpostors(playerCount)
  if (!(impostorCount >= 1 && impostorCount <= limit)) {
    throw new GameValidationError(
      `${playerCount} players can have 1 to ${limit} Impostor${limit > 1 ? 's' : ''}.`,
    )
  }
}

export function validatePlayerNames(names: string[], minimum: number = MIN_PLAYERS): string[] {
  const cleaned = names.map((name) => name.split(/\s+/).filter(Boolean).join(' '))
  if (cleaned.some((name) => !name)) throw new GameValidationError('Player names cannot be empty.')
  if (cleaned.some((name) => name.length > MAX_NAME_LENGTH)) {
    throw new GameValidationError(`Player names must be at most ${MAX_NAME_LENGTH} characters.`)
  }
  if (new Set(cleaned.map((name) => name.toLowerCase())).size !== cleaned.length) {
    throw new GameValidationError('Player names must be unique.')
  }
  if (!(cleaned.length >= minimum && cleaned.length <= MAX_PLAYERS)) {
    throw new GameValidationError(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`)
  }
  return cleaned
}
