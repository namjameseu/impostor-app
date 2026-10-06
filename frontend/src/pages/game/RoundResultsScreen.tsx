import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import { joinNames, playerNames } from '../../utils/players'
import type { ScreenProps } from './types'

export function RoundResultsScreen({ game, onUpdate }: ScreenProps) {
  const { run, pending, error } = useAction()
  const round = game.round!
  const isLastRound = game.current_round_number >= game.total_rounds
  const ranked = [...game.players].sort((a, b) => b.score - a.score || a.order_index - b.order_index)

  const proceed = () =>
    run(async () =>
      onUpdate(await (isLastRound ? gameApi.finish(game.id) : gameApi.nextRound(game.id))),
    )

  return (
    <Screen
      actions={
        <>
          <ErrorMessage error={error} />
          <Button onClick={proceed} loading={pending}>
            {isLastRound ? 'Final results' : 'Next round'}
          </Button>
        </>
      }
    >
      <div className="text-center">
        <Kicker>Round {round.round_number} results</Kicker>
        <p className="mt-3 text-lg font-bold text-muted">
          {(round.impostor_ids?.length ?? 0) > 1 ? 'Impostors' : 'Impostor'}:{' '}
          <span className="text-impostor">{joinNames(playerNames(game.players, round.impostor_ids))}</span>
          {' · '}
          Word: <span className="text-crew">{round.secret_word}</span>
        </p>
      </div>
      <p className="rounded-2xl border border-line bg-panel p-4 text-center text-lg font-extrabold">
        {round.explanation}
      </p>
      <ol className="flex flex-col gap-2">
        {ranked.map((player, index) => {
          const gained = round.points?.[player.id] ?? 0
          return (
            <li
              key={player.id}
              style={{ animationDelay: `${index * 60}ms` }}
              className="flex animate-rise items-center gap-3 rounded-xl bg-panel px-4 py-3 text-lg font-extrabold"
            >
              <span className="flex-1">{player.name}</span>
              {gained > 0 && <span className="text-sm text-gold">+{gained}</span>}
              <span className="w-10 text-right font-display text-xl">{player.score}</span>
            </li>
          )
        })}
      </ol>
    </Screen>
  )
}
