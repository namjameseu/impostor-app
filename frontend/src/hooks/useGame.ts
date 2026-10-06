import { useCallback, useEffect, useState } from 'react'
import { gameApi } from '../services/api'
import type { Game } from '../types/api'

export function useGame(gameId: number) {
  const [game, setGame] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    gameApi
      .get(gameId)
      .then((g) => !cancelled && setGame(g))
      .catch((err: Error) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [gameId, attempt])

  const reload = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { game, setGame, error, reload }
}
