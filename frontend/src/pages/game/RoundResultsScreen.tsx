import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { Modal, inputClass } from '../../components/Modal'
import { Kicker, Screen } from '../../components/Screen'
import { useAction } from '../../hooks/useAction'
import { gameApi } from '../../services/api'
import type { Game } from '../../types/api'
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  activePlayers,
  joinNames,
  normalizeName,
  playerNames,
} from '../../utils/players'
import type { ScreenProps } from './types'

export function RoundResultsScreen({ game, onUpdate }: ScreenProps) {
  const { run, pending, error } = useAction()
  const [editingPlayers, setEditingPlayers] = useState(false)
  const round = game.round!
  const isLastRound = game.current_round_number >= game.total_rounds
  const ranked = [...game.players].sort(
    (a, b) => Number(b.active) - Number(a.active) || b.score - a.score || a.order_index - b.order_index,
  )

  const proceed = () =>
    run(async () =>
      onUpdate(await (isLastRound ? gameApi.finish(game.id) : gameApi.nextRound(game.id))),
    )

  return (
    <Screen
      actions={
        <>
          <ErrorMessage error={error} />
          {!isLastRound && (
            <Button variant="secondary" size="md" onClick={() => setEditingPlayers(true)}>
              👥 Edit players
            </Button>
          )}
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
          {round.impostor_word && (
            <>
              {' · '}
              Impostor&apos;s word: <span className="text-impostor">{round.impostor_word}</span>
            </>
          )}
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
              className={`flex animate-rise items-center gap-3 rounded-xl bg-panel px-4 py-3 text-lg font-extrabold ${
                player.active ? '' : 'opacity-50'
              }`}
            >
              <span className="flex-1">
                {player.name}
                {!player.active && <span className="ml-2 text-xs text-muted">left</span>}
              </span>
              {gained > 0 && <span className="text-sm text-gold">+{gained}</span>}
              <span className="w-10 text-right font-display text-xl">{player.score}</span>
            </li>
          )
        })}
      </ol>
      {editingPlayers && (
        <PlayersEditor game={game} onUpdate={onUpdate} onClose={() => setEditingPlayers(false)} />
      )}
    </Screen>
  )
}

/** Between rounds: someone leaves, or a late arrival joins for the next round. */
function PlayersEditor({
  game,
  onUpdate,
  onClose,
}: {
  game: Game
  onUpdate: (game: Game) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const { run, pending, error } = useAction()
  const players = activePlayers(game.players)

  const apply = (action: () => Promise<Game>) =>
    run(async () => {
      const before = game.settings.impostor_count
      const updated = await action()
      const after = updated.settings.impostor_count
      setNotice(after < before ? `Too few players for ${before} Impostors, so now there ${after === 1 ? 'is 1 Impostor' : `are ${after}`}.` : null)
      onUpdate(updated)
    })

  const add = (e: FormEvent) => {
    e.preventDefault()
    const cleaned = normalizeName(name)
    if (!cleaned) return
    void apply(async () => {
      const updated = await gameApi.addPlayer(game.id, cleaned)
      setName('')
      return updated
    })
  }

  return (
    <Modal title="Edit players" onClose={onClose}>
      <p className="mb-3 text-sm font-bold text-muted">
        Changes apply from the next round. Anyone who leaves keeps their score.
      </p>
      <ul className="mb-4 flex max-h-64 flex-col gap-2 overflow-y-auto">
        {players.map((player) => (
          <li key={player.id} className="flex items-center gap-2 rounded-xl bg-ink px-3 py-2">
            <span className="flex-1 font-extrabold">{player.name}</span>
            <span className="font-display text-muted">{player.score}</span>
            <button
              type="button"
              onClick={() => apply(() => gameApi.removePlayer(game.id, player.id))}
              disabled={pending || players.length <= MIN_PLAYERS}
              aria-label={`Remove ${player.name}`}
              className="h-10 rounded-lg bg-panel-2 px-3 text-xs font-extrabold text-muted enabled:hover:text-rose-300 disabled:opacity-30"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder={players.length >= MAX_PLAYERS ? 'Player limit reached' : 'Late arrival'}
          disabled={players.length >= MAX_PLAYERS}
          aria-label="New player name"
          autoCapitalize="words"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={pending || !normalizeName(name)}
          className="min-h-12 shrink-0 rounded-xl bg-accent px-5 font-display text-ink disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {players.length <= MIN_PLAYERS && (
        <p className="mt-2 text-sm font-bold text-muted">A game needs at least {MIN_PLAYERS} players.</p>
      )}
      {notice && <p className="mt-2 text-sm font-bold text-gold">{notice}</p>}
      <div className="mt-3">
        <ErrorMessage error={error} />
      </div>
      <div className="mt-4">
        <Button size="md" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  )
}
