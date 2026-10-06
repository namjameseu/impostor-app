import { useState, type ButtonHTMLAttributes, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { inputClass } from '../components/Modal'
import { Screen } from '../components/Screen'
import { newPlayerKey, useSetup, type SetupPlayer } from '../stores/setupContext'
import { MAX_NAME_LENGTH, MAX_PLAYERS, MIN_PLAYERS, normalizeName } from '../utils/players'

function problemFor(player: SetupPlayer, players: SetupPlayer[]): string | null {
  const name = normalizeName(player.name)
  if (!name) return 'Name is empty'
  const duplicates = players.filter((p) => normalizeName(p.name).toLowerCase() === name.toLowerCase())
  return duplicates.length > 1 ? 'Duplicate name' : null
}

export function PlayerSetupPage() {
  const navigate = useNavigate()
  const { players, setPlayers } = useSetup()
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)

  const addPlayer = (e: FormEvent) => {
    e.preventDefault()
    const name = normalizeName(draft)
    if (!name) return
    if (players.some((p) => normalizeName(p.name).toLowerCase() === name.toLowerCase())) {
      setDraftError(`${name} is already playing.`)
      return
    }
    setPlayers([...players, { key: newPlayerKey(), name }])
    setDraft('')
    setDraftError(null)
  }

  const rename = (key: string, name: string) =>
    setPlayers(players.map((p) => (p.key === key ? { ...p, name } : p)))
  const remove = (key: string) => setPlayers(players.filter((p) => p.key !== key))
  const move = (index: number, delta: number) => {
    const next = [...players]
    const [moved] = next.splice(index, 1)
    next.splice(index + delta, 0, moved)
    setPlayers(next)
  }

  const hasProblems = players.some((p) => problemFor(p, players))
  const needed = Math.max(0, MIN_PLAYERS - players.length)
  const full = players.length >= MAX_PLAYERS

  const continueToSettings = () => {
    setPlayers(players.map((p) => ({ ...p, name: normalizeName(p.name) })))
    navigate('/settings')
  }

  return (
    <Screen
      header={<BackHeader onBack={() => navigate('/')} />}
      actions={
        <Button disabled={needed > 0 || hasProblems} onClick={continueToSettings}>
          {needed > 0 ? `Add ${needed} more player${needed === 1 ? '' : 's'}` : 'Continue'}
        </Button>
      }
    >
      <h1 className="font-display text-4xl">Players</h1>

      <form onSubmit={addPlayer} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setDraftError(null)
          }}
          maxLength={MAX_NAME_LENGTH}
          placeholder={full ? 'Player limit reached' : 'Player name'}
          disabled={full}
          enterKeyHint="done"
          autoCapitalize="words"
          aria-label="New player name"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={full || !normalizeName(draft)}
          className="min-h-12 shrink-0 rounded-xl bg-accent px-5 font-display text-ink disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {draftError && <p className="-mt-3 text-sm font-bold text-rose-300">{draftError}</p>}

      <ol className="flex flex-col gap-2">
        {players.map((player, index) => {
          const problem = problemFor(player, players)
          return (
            <li key={player.key} className="flex animate-rise flex-col gap-1">
              <div className="flex items-center gap-2 rounded-2xl bg-panel p-2 pl-3">
                <span className="w-6 shrink-0 text-center font-display text-muted">{index + 1}</span>
                <input
                  value={player.name}
                  onChange={(e) => rename(player.key, e.target.value)}
                  maxLength={MAX_NAME_LENGTH}
                  aria-label={`Player ${index + 1} name`}
                  className={`min-h-11 min-w-0 flex-1 rounded-lg border-2 bg-transparent px-2 text-lg font-extrabold focus:outline-none ${
                    problem ? 'border-impostor' : 'border-transparent focus:border-line'
                  }`}
                />
                <IconButton label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                  ↑
                </IconButton>
                <IconButton
                  label="Move down"
                  disabled={index === players.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </IconButton>
                <IconButton label={`Remove ${player.name}`} onClick={() => remove(player.key)}>
                  ✕
                </IconButton>
              </div>
              {problem && <p className="pl-11 text-sm font-bold text-rose-300">{problem}</p>}
            </li>
          )
        })}
      </ol>

      {players.length === 0 && (
        <p className="text-center font-bold text-muted">Add at least {MIN_PLAYERS} players to start.</p>
      )}
    </Screen>
  )
}

function IconButton({
  label,
  children,
  ...props
}: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-lg font-extrabold text-muted hover:text-white disabled:opacity-25"
    >
      {children}
    </button>
  )
}

export function BackHeader({ onBack, title }: { onBack: () => void; title?: string }) {
  return (
    <header className="flex items-center gap-3 pt-1">
      <button type="button" onClick={onBack} className="min-h-11 px-1 text-sm font-extrabold text-muted hover:text-white">
        ← Back
      </button>
      {title && <span className="font-display text-lg">{title}</span>}
    </header>
  )
}
