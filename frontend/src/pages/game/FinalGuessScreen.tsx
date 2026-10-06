import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { BigName, Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import { playerName } from '../../utils/players'
import type { ScreenProps } from './types'

export function FinalGuessScreen({ game, onUpdate }: ScreenProps) {
  const { run, pending, error } = useAction()
  const round = game.round!
  const impostor = playerName(game.players, round.impostor_id)

  const revealWord = () => run(async () => onUpdate(await gameApi.revealWord(game.id)))
  const record = (correct: boolean) =>
    run(async () => onUpdate(await gameApi.recordFinalGuess(game.id, correct)))

  if (!round.word_revealed) {
    return (
      <Screen
        center
        actions={
          <>
            <ErrorMessage error={error} />
            <Button onClick={revealWord} loading={pending}>
              Reveal word
            </Button>
          </>
        }
      >
        <span className="animate-pop text-6xl" aria-hidden="true">🎯</span>
        <BigName className="animate-pop text-3xl sm:text-4xl">
          <span className="text-impostor">{impostor}</span> was the Impostor!
        </BigName>
        <p className="animate-rise text-xl font-bold text-muted [animation-delay:500ms]">
          But {impostor} has one last chance…
        </p>
        <p className="animate-rise text-2xl font-extrabold [animation-delay:900ms]">
          Can you guess the secret word?
        </p>
        <p className="animate-rise font-bold text-muted [animation-delay:900ms]">Say it out loud!</p>
      </Screen>
    )
  }

  return (
    <Screen
      center
      actions={
        <>
          <ErrorMessage error={error} />
          <p className="text-center text-lg font-extrabold">Did {impostor} guess correctly?</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="danger" onClick={() => record(true)} disabled={pending}>
              Yes
            </Button>
            <Button variant="crew" onClick={() => record(false)} disabled={pending}>
              No
            </Button>
          </div>
        </>
      }
    >
      <Kicker>The word was…</Kicker>
      <BigName className="animate-pop text-crew">{round.secret_word}</BigName>
      <p className="font-bold text-muted">Category: {round.category}</p>
    </Screen>
  )
}
