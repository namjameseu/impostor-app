import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { BigName, Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import { plural } from '../../utils/players'
import type { ScreenProps } from './types'

export function LobbyScreen({ game, onUpdate }: ScreenProps) {
  const { run, pending, error } = useAction()
  const { settings } = game
  const start = () => run(async () => onUpdate(await gameApi.start(game.id)))

  return (
    <Screen
      center
      actions={
        <>
          <ErrorMessage error={error} />
          <Button onClick={start} loading={pending}>
            Start game
          </Button>
        </>
      }
    >
      <Kicker>Ready to play?</Kicker>
      <BigName>{game.players.length} players</BigName>
      <p className="text-lg font-bold text-muted">
        {game.players.map((p) => p.name).join(' · ')}
      </p>
      <ul className="flex flex-col gap-1 font-bold text-muted">
        <li>{settings.total_rounds} rounds</li>
        <li>
          {plural(settings.impostor_count, 'Impostor')}
          {settings.impostor_count > 1 &&
            (settings.impostors_know_each_other ? ' who know each other' : ' working alone')}
        </li>
        <li>
          {settings.category_mode === 'random'
            ? 'Random categories'
            : settings.categories.map((c) => c.name).join(', ')}
        </li>
        <li>{settings.impostor_hint === 'category' ? 'Impostor sees the category' : 'No hint for the Impostor'}</li>
      </ul>
    </Screen>
  )
}
