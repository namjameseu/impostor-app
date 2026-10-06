import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { BigName, Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import type { Game } from '../../types/api'
import { feedback } from '../../utils/feedback'
import { joinNames, playerName, playerNames } from '../../utils/players'
import type { ScreenProps } from './types'

export function ImpostorRevealScreen({ game, onUpdate }: ScreenProps) {
  const { run, pending, error } = useAction()
  const [result, setResult] = useState<Game | null>(null)
  const suspectNames = playerNames(game.players, game.round!.suspect_ids)
  const single = game.settings.impostor_count === 1

  const reveal = () =>
    run(async () => {
      feedback.drumroll()
      const updated = await gameApi.revealImpostors(game.id)
      // With one Impostor who was caught, the final-guess screen already shows the verdict.
      if (single && updated.state === 'FINAL_GUESS') onUpdate(updated)
      else setResult(updated)
    })

  if (result) return <Verdict game={result} onContinue={() => onUpdate(result)} />

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
      <BigName className={`animate-drumroll text-impostor ${suspectNames.length > 1 ? 'text-4xl' : ''}`}>
        {joinNames(suspectNames)}
      </BigName>
      <p className="font-bold text-muted">Were you right?</p>
    </Screen>
  )
}

function Verdict({ game, onContinue }: { game: Game; onContinue: () => void }) {
  const round = game.round!
  const impostorIds = round.impostor_ids ?? []
  const caught = round.caught_impostor_ids ?? []
  const escaped = impostorIds.filter((id) => !caught.includes(id))
  const single = impostorIds.length === 1
  const finalGuess = game.state === 'FINAL_GUESS'

  useEffect(() => {
    const timer = setTimeout(caught.length > 0 ? feedback.caught : feedback.escaped, 400)
    return () => clearTimeout(timer)
  }, [caught.length])

  const headline = single
    ? `${playerName(game.players, round.suspect_ids[0])} was not the Impostor!`
    : caught.length === 0
      ? 'No Impostors caught!'
      : `${caught.length} of ${impostorIds.length} Impostors caught!`

  return (
    <Screen center actions={<Button onClick={onContinue}>{finalGuess ? 'Final guess' : 'See results'}</Button>}>
      <BigName className="animate-pop text-3xl sm:text-4xl">{headline}</BigName>

      {!single && (
        <ul className="flex w-full flex-col gap-2">
          {round.suspect_ids.map((id, index) => {
            const isImpostor = impostorIds.includes(id)
            return (
              <li
                key={id}
                style={{ animationDelay: `${400 + index * 500}ms` }}
                className={`flex animate-rise items-center justify-between rounded-xl border-2 px-4 py-3 text-lg font-extrabold ${
                  isImpostor ? 'border-impostor bg-impostor/15' : 'border-line bg-panel'
                }`}
              >
                {playerName(game.players, id)}
                <span className={isImpostor ? 'text-impostor' : 'text-crew'}>
                  {isImpostor ? 'Impostor!' : 'Innocent'}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {escaped.length > 0 && (
        <div className="flex animate-rise flex-col items-center gap-2 [animation-delay:1400ms]">
          <Kicker>{single ? 'The real Impostor was' : escaped.length === 1 ? 'Still hiding was' : 'Still hiding were'}</Kicker>
          <BigName className="text-4xl text-impostor">{joinNames(playerNames(game.players, escaped))}</BigName>
        </div>
      )}

      {round.secret_word && (
        <div className="animate-rise rounded-2xl border border-line bg-panel px-6 py-4 [animation-delay:1900ms]">
          <Kicker>The word was</Kicker>
          <p className="font-display text-3xl text-crew">{round.secret_word}</p>
          {round.impostor_word && (
            <p className="mt-1 font-bold text-muted">
              Impostor{impostorIds.length > 1 ? 's' : ''} had:{' '}
              <span className="text-impostor">{round.impostor_word}</span>
            </p>
          )}
        </div>
      )}
    </Screen>
  )
}
