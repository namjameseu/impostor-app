import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { BigName, Kicker, Screen } from '../../components/Screen'
import { Loading } from '../../components/Spinner'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import { useSetup } from '../../stores/setupContext'
import type { GameResults } from '../../types/api'
import { feedback } from '../../utils/feedback'
import { revealAboveActions } from '../../utils/scroll'
import type { ScreenProps } from './types'

export function GameResultsScreen({ game }: ScreenProps) {
  const navigate = useNavigate()
  const { setActiveGameId, setPlayerNames } = useSetup()
  const [results, setResults] = useState<GameResults | null>(null)
  const { run, pending, error } = useAction()
  const resultsLoad = useAction()
  const loadResults = resultsLoad.run

  useEffect(() => {
    loadResults(() => gameApi.results(game.id)).then((r) => {
      if (!r) return
      setResults(r)
      feedback.fanfare()
    })
  }, [game.id, loadResults])

  const playAgain = () =>
    run(async () => {
      const next = await gameApi.playAgain(game.id)
      setActiveGameId(next.id)
      navigate(`/game/${next.id}`)
    })

  const newGame = () => {
    setPlayerNames(game.players.map((p) => p.name))
    setActiveGameId(null)
    navigate('/setup')
  }

  const winners = results?.standings.filter((s) => s.rank === 1) ?? []

  return (
    <Screen
      actions={
        <>
          <ErrorMessage error={error ?? resultsLoad.error} />
          {/* Side by side to keep the pinned bar short on phones. */}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={newGame}>
              New game
            </Button>
            <Button onClick={playAgain} loading={pending}>
              Play again
            </Button>
          </div>
        </>
      }
    >
      <div className="text-center">
        <Kicker>Game over</Kicker>
        {winners.length > 0 && (
          <div className="mt-4 flex animate-pop flex-col items-center gap-2">
            <span className="text-7xl" aria-hidden="true">🏆</span>
            <BigName className="text-gold">{winners.map((w) => w.name).join(' & ')}</BigName>
            <p className="font-extrabold text-muted">{winners.length > 1 ? 'tie for the win!' : 'wins!'}</p>
          </div>
        )}
      </div>
      {!results && !resultsLoad.error && <Loading label="Tallying scores…" />}
      <ol className="flex flex-col gap-2">
        {results?.standings.map((standing, index) => (
          <li
            key={standing.player_id}
            style={{ animationDelay: `${300 + index * 80}ms` }}
            className={`flex animate-rise items-center gap-3 rounded-xl px-4 py-3 text-lg font-extrabold ${
              standing.rank === 1 ? 'border-2 border-gold bg-gold/15' : 'bg-panel'
            }`}
          >
            <span className="w-8 font-display text-muted">{standing.rank}.</span>
            <span className="flex-1">{standing.name}</span>
            <span className="font-display text-xl">{standing.score}</span>
          </li>
        ))}
      </ol>
      {results && results.rounds.length > 0 && (
        <details
          onToggle={(e) => e.currentTarget.open && revealAboveActions(e.currentTarget)}
          className="rounded-xl bg-panel/60 px-4 py-3 text-sm font-bold text-muted"
        >
          <summary className="cursor-pointer text-white">Round by round</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {results.rounds.map((r) => (
              <li key={r.round_number}>
                <span className="text-white">Round {r.round_number}:</span> {r.secret_word}
                {r.impostor_word && ` vs ${r.impostor_word}`} ({r.category}) —{' '}
                {r.explanation}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Screen>
  )
}
