import { useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { BigName, Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import type { Game } from '../../types/api'
import { playerName } from '../../utils/players'
import type { ScreenProps } from './types'

export function ImpostorRevealScreen({ game, onUpdate }: ScreenProps) {
  const { run, pending, error } = useAction()
  const [result, setResult] = useState<Game | null>(null)
  const suspectName = playerName(game.players, game.round!.suspect_id)

  const reveal = () =>
    run(async () => {
      const updated = await gameApi.revealImpostor(game.id)
      // A caught Impostor goes straight to their final-guess screen, which shows the verdict.
      if (updated.round!.impostor_caught) onUpdate(updated)
      else setResult(updated)
    })

  if (result) {
    const round = result.round!
    return (
      <Screen center actions={<Button onClick={() => onUpdate(result)}>See results</Button>}>
        <BigName className="animate-pop text-3xl sm:text-4xl">
          {suspectName} was <span className="text-crew">not</span> the Impostor!
        </BigName>
        <div className="flex animate-rise flex-col items-center gap-2 [animation-delay:600ms]">
          <Kicker>The real Impostor was</Kicker>
          <BigName className="text-impostor">{playerName(result.players, round.impostor_id)}</BigName>
        </div>
        <div className="animate-rise rounded-2xl border border-line bg-panel px-6 py-4 [animation-delay:1200ms]">
          <Kicker>The word was</Kicker>
          <p className="font-display text-3xl text-crew">{round.secret_word}</p>
        </div>
      </Screen>
    )
  }

  return (
    <Screen
      center
      actions={
        <>
          <ErrorMessage error={error} />
          <Button variant="danger" onClick={reveal} loading={pending}>
            Reveal the truth
          </Button>
        </>
      }
    >
      <Kicker>The group chose…</Kicker>
      <BigName className="animate-drumroll text-impostor">{suspectName}</BigName>
      <p className="font-bold text-muted">Were you right?</p>
    </Screen>
  )
}
