import { useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import type { ScreenProps } from './types'

export function VotingScreen({ game, onUpdate }: ScreenProps) {
  const [suspect, setSuspect] = useState<number | null>(null)
  const { run, pending, error } = useAction()
  const lockIn = () =>
    suspect !== null && run(async () => onUpdate(await gameApi.selectSuspect(game.id, suspect)))

  return (
    <Screen
      actions={
        <>
          <ErrorMessage error={error} />
          <Button variant="danger" onClick={lockIn} disabled={suspect === null} loading={pending}>
            Reveal
          </Button>
        </>
      }
    >
      <div className="text-center">
        <Kicker>Discuss, then vote together</Kicker>
        <h1 className="mt-2 font-display text-4xl">Who is the Impostor?</h1>
      </div>
      <div role="radiogroup" aria-label="Suspected Impostor" className="flex flex-col gap-2">
        {game.players.map((player) => {
          const selected = suspect === player.id
          return (
            <button
              key={player.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSuspect(player.id)}
              className={`flex min-h-16 items-center gap-4 rounded-2xl border-2 px-5 text-left text-xl font-extrabold transition-colors ${
                selected ? 'border-impostor bg-impostor/20' : 'border-line bg-panel'
              }`}
            >
              <span
                className={`h-6 w-6 shrink-0 rounded-full border-2 ${
                  selected ? 'border-impostor bg-impostor shadow-[inset_0_0_0_4px_var(--color-ink)]' : 'border-muted'
                }`}
              />
              {player.name}
            </button>
          )
        })}
      </div>
    </Screen>
  )
}
