import { loadJson, saveJson } from './storage'

// Games played on this device. Player stats are computed from these, so a public deployment
// shows each group its own stats instead of mixing everyone with the same name.
const KEY = 'impostor.history'
const MAX = 500

export const playedGameIds = (): number[] => loadJson<number[]>(KEY, [])

export function rememberGame(gameId: number): void {
  const ids = playedGameIds().filter((id) => id !== gameId)
  saveJson(KEY, [gameId, ...ids].slice(0, MAX))
}
