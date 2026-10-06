import type { Player } from '../types/api'

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 20
export const MAX_NAME_LENGTH = 30

export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ')

export function playerName(players: Player[], id: number | null | undefined): string {
  return players.find((p) => p.id === id)?.name ?? 'Someone'
}

/** Players in speaking order, starting from the given player. */
export function orderFrom(players: Player[], startId: number): Player[] {
  const index = players.findIndex((p) => p.id === startId)
  return index < 0 ? players : [...players.slice(index), ...players.slice(0, index)]
}
