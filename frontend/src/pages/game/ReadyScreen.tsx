import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { BigName, Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import { playerName } from '../../utils/players'
import type { ScreenProps } from './types'

export function ReadyScreen({ game, onUpdate }: ScreenProps) {
  const { run, pending, error } = useAction()
  const starter = playerName(game.players, game.round!.starting_player_id)
  const start = () => run(async () => onUpdate(await gameApi.startClues(game.id)))

  return (
    <Screen
      center
      actions={
        <>
          <ErrorMessage error={error} />
          <Button onClick={start} loading={pending}>
            Start round
          </Button>
        </>
      }
    >
      <span className="text-6xl" aria-hidden="true">📱⬇️</span>
      <h1 className="font-display text-3xl">Everyone has their role</h1>
      <p className="text-xl font-bold text-muted">
        Put the phone down.
        <br />
        Time to give your clues!
      </p>
      <div className="mt-4 animate-pop">
        <BigName className="text-gold">{starter}</BigName>
        <Kicker>goes first</Kicker>
      </div>
    </Screen>
  )
}
