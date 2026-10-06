import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { HoldToReveal } from '../../components/HoldToReveal'
import { BigName, Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import type { Game, PlayerRole } from '../../types/api'
import { playerName } from '../../utils/players'
import type { ScreenProps } from './types'

type Step = 'pass' | 'hold' | 'hidden'

/**
 * One player's private turn. Keyed by revealer id, so all local state (including the
 * fetched role) is discarded when the turn moves on.
 */
export function RoleRevealScreen({ game, onUpdate }: ScreenProps) {
  const round = game.round!
  const revealerId = round.revealer_id!
  const name = playerName(game.players, revealerId)
  const nextName = round.next_revealer_id ? playerName(game.players, round.next_revealer_id) : null

  const [step, setStep] = useState<Step>('pass')
  const [role, setRole] = useState<PlayerRole | null>(null)
  const [hasPeeked, setHasPeeked] = useState(false)
  const [afterReveal, setAfterReveal] = useState<Game | null>(null)
  const { run, pending, error } = useAction()

  useEffect(() => {
    if (step !== 'hold') return
    let cancelled = false
    run(() => gameApi.getRole(game.id, revealerId)).then((r) => !cancelled && r && setRole(r))
    return () => {
      cancelled = true
    }
  }, [step, game.id, revealerId, run])

  const finishTurn = () =>
    run(async () => {
      const updated = await gameApi.completeReveal(game.id, revealerId)
      setRole(null)
      setAfterReveal(updated)
      setStep('hidden')
    })

  if (step === 'pass') {
    return (
      <Screen
        center
        actions={
          <Button onClick={() => setStep('hold')}>I&apos;m {name}</Button>
        }
      >
        <p className="text-sm font-extrabold text-muted">
          Player {round.revealed_count + 1} of {game.players.length}
        </p>
        <Kicker>Pass the phone to</Kicker>
        <BigName className="animate-pop text-crew">{name}</BigName>
        <p className="max-w-xs rounded-2xl border border-line bg-panel px-4 py-3 font-bold text-muted">
          🙈 Make sure nobody else can see the screen.
        </p>
      </Screen>
    )
  }

  if (step === 'hold') {
    return (
      <Screen
        actions={
          <>
            <ErrorMessage error={error} />
            <Button variant="secondary" onClick={finishTurn} disabled={!hasPeeked} loading={pending && !!role}>
              {hasPeeked ? 'Done, hide it' : 'Peek first'}
            </Button>
          </>
        }
      >
        <div className="text-center">
          <Kicker>Only for</Kicker>
          <BigName className="text-4xl sm:text-5xl">{name}</BigName>
        </div>
        <HoldToReveal disabled={!role} loading={!role && !error} onRevealed={() => setHasPeeked(true)}>
          {role && <RoleCard role={role} />}
        </HoldToReveal>
      </Screen>
    )
  }

  return (
    <Screen center actions={<Button onClick={() => afterReveal && onUpdate(afterReveal)}>{nextName ? 'Next player' : 'Continue'}</Button>}>
      <span className="text-6xl" aria-hidden="true">🤫</span>
      <BigName>Word hidden</BigName>
      <p className="text-xl font-bold text-muted">
        {nextName ? (
          <>
            Pass the phone to <span className="text-white">{nextName}</span>.
          </>
        ) : (
          'Everyone has seen their role.'
        )}
      </p>
    </Screen>
  )
}

function RoleCard({ role }: { role: PlayerRole }) {
  if (role.role === 'impostor') {
    return (
      <div className="flex flex-col items-center gap-4">
        <span className="text-6xl" aria-hidden="true">🕵️</span>
        <p className="font-display text-4xl leading-tight text-impostor">
          You are the Impostor
        </p>
        {role.category && <p className="text-lg font-extrabold">Category: {role.category}</p>}
        <p className="font-bold text-muted">Blend in!</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <Kicker>Your word is</Kicker>
      <p className="font-display text-5xl leading-tight break-words text-crew">{role.word}</p>
      <p className="text-lg font-extrabold">Category: {role.category}</p>
      <p className="font-bold text-muted">Keep this secret!</p>
    </div>
  )
}
