import { useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import type { ScreenProps } from './types'

export function VotingScreen({ game, onUpdate }: ScreenProps) {
  const needed = game.settings.impostor_count
  const [suspects, setSuspects] = useState<number[]>([])
  const { run, pending, error } = useAction()
  const full = suspects.length === needed

  const toggle = (id: number) => {
    if (needed === 1) return setSuspects([id])
    if (suspects.includes(id)) return setSuspects(suspects.filter((s) => s !== id))
    if (!full) setSuspects([...suspects, id])
  }

  const lockIn = () => full && run(async () => onUpdate(await gameApi.selectSuspects(game.id, suspects)))

  return (
    <Screen
      actions={
        <>
          <ErrorMessage error={error} />
          <Button variant="danger" onClick={lockIn} disabled={!full} loading={pending}>
            {needed > 1 && !full ? `Pick ${needed - suspects.length} more` : 'Reveal'}
          </Button>
        </>
      }
    >
      <div className="text-center">
        <Kicker>Discuss, then vote together</Kicker>
        <h1 className="mt-2 font-display text-4xl">
          {needed === 1 ? 'Who is the Impostor?' : `Who are the ${needed} Impostors?`}
        </h1>
      </div>
      <div
        role={needed === 1 ? 'radiogroup' : 'group'}
        aria-label="Suspected Impostors"
        className="flex flex-col gap-2"
      >
        {game.players.map((player) => {
          const selected = suspects.includes(player.id)
          const locked = !selected && full && needed > 1
          return (
            <button
              key={player.id}
              type="button"
              role={needed === 1 ? 'radio' : 'checkbox'}
              aria-checked={selected}
              aria-disabled={locked || undefined}
              onClick={() => toggle(player.id)}
              className={`flex min-h-16 items-center gap-4 rounded-2xl border-2 px-5 text-left text-xl font-extrabold transition-colors ${
                selected ? 'border-impostor bg-impostor/20' : 'border-line bg-panel'
              } ${locked ? 'opacity-40' : ''}`}
            >
              <span
                className={`h-6 w-6 shrink-0 border-2 ${needed === 1 ? 'rounded-full' : 'rounded-md'} ${
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
