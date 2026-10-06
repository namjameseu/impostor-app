import type { Player } from '../types/api'

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 20
export const MAX_NAME_LENGTH = 30

/** Impostors must always be outnumbered: 1 for 3-4 players, 2 for 5-6, 3 for 7-8... */
export const maxImpostors = (playerCount: number) => Math.max(1, Math.floor((playerCount - 1) / 2))

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** "Mark", "Mark & Anna", "Mark, Anna & Ben" */
export function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}

export function playerNames(players: Player[], ids: number[] | null | undefined): string[] {
  return (ids ?? []).map((id) => playerName(players, id))
}

export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ')

export function playerName(players: Player[], id: number | null | undefined): string {
  return players.find((p) => p.id === id)?.name ?? 'Someone'
}

/** Players in speaking order, starting from the given player. */
export function orderFrom(players: Player[], startId: number): Player[] {
  const index = players.findIndex((p) => p.id === startId)
  return index < 0 ? players : [...players.slice(index), ...players.slice(0, index)]
}
