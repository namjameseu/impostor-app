import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GameSettings } from '../types/api'
import { loadJson, saveJson } from '../utils/storage'
import {
  DEFAULT_SETTINGS,
  newPlayerKey,
  SetupContext,
  type SetupState,
  type SetupStore,
} from './setupContext'

const STORAGE_KEY = 'impostor.setup'

type StoredSettings = Partial<GameSettings> & { category_id?: number | null }

function loadState(): SetupState {
  const saved = loadJson<Partial<Omit<SetupState, 'settings'>> & { settings?: StoredSettings }>(
    STORAGE_KEY,
    {},
  )
  const settings = saved.settings ?? {}
  return {
    players: saved.players ?? [],
    activeGameId: saved.activeGameId ?? null,
    // Pick known fields only, so settings removed in newer versions are dropped.
    settings: {
      total_rounds: settings.total_rounds ?? DEFAULT_SETTINGS.total_rounds,
      category_mode: settings.category_mode ?? DEFAULT_SETTINGS.category_mode,
      // Older saves stored a single category.
      category_ids:
        settings.category_ids ?? (settings.category_id ? [settings.category_id] : []),
      impostor_hint: settings.impostor_hint ?? DEFAULT_SETTINGS.impostor_hint,
      impostor_count: settings.impostor_count ?? DEFAULT_SETTINGS.impostor_count,
      impostors_know_each_other:
        settings.impostors_know_each_other ?? DEFAULT_SETTINGS.impostors_know_each_other,
    },
  }
}

export function SetupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SetupState>(loadState)

  useEffect(() => saveJson(STORAGE_KEY, state), [state])

  const store = useMemo<SetupStore>(
    () => ({
      ...state,
      setPlayers: (players) => setState((s) => ({ ...s, players })),
      setPlayerNames: (names) =>
        setState((s) => ({ ...s, players: names.map((name) => ({ key: newPlayerKey(), name })) })),
      setSettings: (settings) => setState((s) => ({ ...s, settings })),
      setActiveGameId: (activeGameId) => setState((s) => ({ ...s, activeGameId })),
    }),
    [state],
  )

  return <SetupContext.Provider value={store}>{children}</SetupContext.Provider>
}
