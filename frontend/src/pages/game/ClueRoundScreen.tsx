import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { BigName, Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import { activePlayers, orderFrom } from '../../utils/players'
import type { ScreenProps } from './types'

export function ClueRoundScreen({ game, onUpdate }: ScreenProps) {
  const { run, pending, error } = useAction()
  const round = game.round!
  const order = orderFrom(activePlayers(game.players), round.starting_player_id)
  const toVoting = () => run(async () => onUpdate(await gameApi.startVoting(game.id)))

  return (
    <Screen
      actions={
        <>
          <ErrorMessage error={error} />
          <Button onClick={toVoting} loading={pending}>
            Continue to voting
          </Button>
        </>
      }
    >
      <div className="text-center">
        <Kicker>Round {round.round_number}</Kicker>
        <BigName className="mt-2 text-gold">{order[0].name}</BigName>
        <Kicker>goes first</Kicker>
      </div>
      <div className="rounded-2xl border border-line bg-panel p-4 text-center">
        <p className="text-xl font-extrabold">Give one clue about the secret word.</p>
        <p className="mt-1 font-bold text-muted">Don&apos;t make it too obvious.</p>
      </div>
      <ol className="flex flex-col gap-2">
        {order.map((player, index) => (
          <li key={player.id} className="flex items-center gap-3 rounded-xl bg-panel/60 px-4 py-3 text-lg font-extrabold">
            <span className="w-6 font-display text-muted">{index + 1}</span>
            {player.name}
          </li>
        ))}
      </ol>
    </Screen>
  )
}
