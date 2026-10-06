import { createContext, useContext } from 'react'
import type { GameSettings } from '../types/api'

export interface SetupPlayer {
  key: string
  name: string
}

export const DEFAULT_SETTINGS: GameSettings = {
  total_rounds: 5,
  category_mode: 'random',
  category_ids: [],
  impostor_hint: 'category',
  impostor_count: 1,
  impostors_know_each_other: false,
}

export interface SetupState {
  players: SetupPlayer[]
  settings: GameSettings
  activeGameId: number | null
}

export interface SetupStore extends SetupState {
  setPlayers: (players: SetupPlayer[]) => void
  setPlayerNames: (names: string[]) => void
  setSettings: (settings: GameSettings) => void
  setActiveGameId: (id: number | null) => void
}

export const SetupContext = createContext<SetupStore | null>(null)

export const newPlayerKey = () => Math.random().toString(36).slice(2, 10)

export function useSetup(): SetupStore {
  const store = useContext(SetupContext)
  if (!store) throw new Error('useSetup must be used inside <SetupProvider>')
  return store
}
