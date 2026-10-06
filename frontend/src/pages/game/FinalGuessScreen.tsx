import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { BigName, Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import { feedback } from '../../utils/feedback'
import { joinNames, playerName, playerNames } from '../../utils/players'
import type { ScreenProps } from './types'

export function FinalGuessScreen({ game, onUpdate }: ScreenProps) {
  const { run, pending, error } = useAction()
  const round = game.round!
  const caught = round.caught_impostor_ids ?? []
  const names = joinNames(playerNames(game.players, caught))
  const several = caught.length > 1
  const totalImpostors = game.settings.impostor_count

  const similarMode = game.settings.impostor_mode === 'similar_word'

  // A single caught Impostor skips the verdict screen, so celebrate the catch here.
  useEffect(() => {
    if (!round.word_revealed && totalImpostors === 1) feedback.caught()
  }, [round.word_revealed, totalImpostors])

  const revealWord = () =>
    run(async () => {
      const updated = await gameApi.revealWord(game.id)
      feedback.wordRevealed()
      onUpdate(updated)
    })
  const record = (correctIds: number[]) =>
    run(async () => onUpdate(await gameApi.recordFinalGuess(game.id, correctIds)))

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
          <span className="text-impostor">{names}</span>{' '}
          {several ? 'were Impostors!' : totalImpostors > 1 ? 'was an Impostor!' : 'was the Impostor!'}
        </BigName>
        <p className="animate-rise text-xl font-bold text-muted [animation-delay:500ms]">
          But {several ? 'they each have' : `${names} has`} one last chance…
        </p>
        <p className="animate-rise text-2xl font-extrabold [animation-delay:900ms]">
          {similarMode ? 'Can you guess what everyone else had?' : 'Can you guess the secret word?'}
        </p>
        <p className="animate-rise font-bold text-muted [animation-delay:900ms]">
          {several ? 'Each of you says one guess out loud!' : 'Say it out loud!'}
        </p>
      </Screen>
    )
  }

  if (several) return <MultiGuess game={game} onSubmit={record} pending={pending} error={error} />

  return (
    <Screen
      center
      actions={
        <>
          <ErrorMessage error={error} />
          <p className="text-center text-lg font-extrabold">Did {names} guess correctly?</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="danger" onClick={() => record(caught)} disabled={pending}>
              Yes
            </Button>
            <Button variant="crew" onClick={() => record([])} disabled={pending}>
              No
            </Button>
          </div>
        </>
      }
    >
      <WordReveal word={round.secret_word} category={round.category} impostorWord={round.impostor_word} />
    </Screen>
  )
}

function WordReveal({
  word,
  category,
  impostorWord,
}: {
  word: string | null
  category: string | null
  impostorWord: string | null
}) {
  return (
    <>
      <Kicker>The word was…</Kicker>
      <BigName className="animate-pop text-crew">{word}</BigName>
      <p className="font-bold text-muted">Category: {category}</p>
      {impostorWord && (
        <p className="font-bold text-muted">
          The Impostor&apos;s word: <span className="text-impostor">{impostorWord}</span>
        </p>
      )}
    </>
  )
}

/** Several caught Impostors: mark each spoken guess right or wrong, then confirm. */
function MultiGuess({
  game,
  onSubmit,
  pending,
  error,
}: {
  game: ScreenProps['game']
  onSubmit: (correctIds: number[]) => void
  pending: boolean
  error: string | null
}) {
  const round = game.round!
  const caught = round.caught_impostor_ids ?? []
  const [answers, setAnswers] = useState<Record<number, boolean>>({})
  const done = caught.every((id) => id in answers)

  return (
    <Screen
      actions={
        <>
          <ErrorMessage error={error} />
          <Button
            onClick={() => onSubmit(caught.filter((id) => answers[id]))}
            disabled={!done}
            loading={pending}
          >
            {done ? 'Confirm' : 'Mark every guess'}
          </Button>
        </>
      }
    >
      <div className="text-center">
        <WordReveal word={round.secret_word} category={round.category} impostorWord={round.impostor_word} />
      </div>
      <p className="text-center text-lg font-extrabold">Who guessed correctly?</p>
      <ul className="flex flex-col gap-3">
        {caught.map((id) => (
          <li key={id} className="flex flex-col gap-2 rounded-2xl bg-panel p-3">
            <span className="px-1 text-lg font-extrabold">{playerName(game.players, id)}</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: 'Got it', on: 'border-impostor bg-impostor/25' },
                { value: false, label: 'Missed', on: 'border-crew bg-crew/20' },
              ].map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  aria-pressed={answers[id] === choice.value}
                  onClick={() => setAnswers({ ...answers, [id]: choice.value })}
                  className={`min-h-12 rounded-xl border-2 font-display uppercase ${
                    answers[id] === choice.value ? choice.on : 'border-line text-muted'
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Screen>
  )
}
