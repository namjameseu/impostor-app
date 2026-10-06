import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorMessage } from '../components/ErrorMessage'
import { Screen } from '../components/Screen'
import { Loading } from '../components/Spinner'
import { useAction } from '../hooks/useAction'
import { statsApi } from '../services/api'
import type { PlayerStats, Stats } from '../types/api'
import { playedGameIds } from '../utils/history'
import { BackHeader } from './PlayerSetupPage'

interface Highlight {
  icon: string
  title: string
  pick: (players: PlayerStats[]) => { player: PlayerStats; detail: string } | null
}

function best(players: PlayerStats[], value: (p: PlayerStats) => number) {
  const top = [...players].sort((a, b) => value(b) - value(a) || b.points - a.points)[0]
  return top && value(top) > 0 ? top : null
}

const HIGHLIGHTS: Highlight[] = [
  {
    icon: '🏆',
    title: 'Most wins',
    pick: (ps) => {
      const p = best(ps, (x) => x.wins)
      return p && { player: p, detail: `${p.wins} win${p.wins === 1 ? '' : 's'}` }
    },
  },
  {
    icon: '🕵️',
    title: 'Best liar',
    pick: (ps) => {
      const p = best(ps, (x) => x.escaped)
      return p && { player: p, detail: `escaped ${p.escaped} of ${p.impostor_rounds} times` }
    },
  },
  {
    icon: '🎯',
    title: 'Sharpest guesser',
    pick: (ps) => {
      const p = best(ps, (x) => x.guessed_word)
      return p && { player: p, detail: `guessed the word ${p.guessed_word}× when caught` }
    },
  },
  {
    icon: '🚨',
    title: 'Worst poker face',
    pick: (ps) => {
      const p = best(ps, (x) => x.caught)
      return p && { player: p, detail: `caught ${p.caught} of ${p.impostor_rounds} times` }
    },
  },
]

export function StatsPage() {
  const navigate = useNavigate()
  const [ids] = useState(playedGameIds)
  const [stats, setStats] = useState<Stats | null>(null)
  const { run, error } = useAction()

  useEffect(() => {
    if (ids.length === 0) return
    run(() => statsApi.forGames(ids)).then((s) => s && setStats(s))
  }, [ids, run])

  const empty = ids.length === 0 || stats?.players.length === 0

  return (
    <Screen header={<BackHeader onBack={() => navigate(-1)} title="Player stats" />}>
      <p className="text-sm font-bold text-muted">
        From the games played on this device{stats ? ` (${stats.games})` : ''}. Players are matched by name.
      </p>
      <ErrorMessage error={error} />

      {empty ? (
        <p className="py-10 text-center font-bold text-muted">No finished rounds yet. Go play a game!</p>
      ) : !stats ? (
        !error && <Loading label="Crunching numbers…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {HIGHLIGHTS.map((h) => {
              const result = h.pick(stats.players)
              return (
                <div key={h.title} className="flex animate-rise flex-col gap-1 rounded-2xl border border-line bg-panel p-3">
                  <span className="text-2xl" aria-hidden="true">{h.icon}</span>
                  <span className="text-xs font-extrabold tracking-widest text-muted uppercase">{h.title}</span>
                  <span className="truncate font-display text-lg">{result?.player.name ?? '—'}</span>
                  <span className="text-xs font-bold text-muted">{result?.detail ?? 'Nobody yet'}</span>
                </div>
              )
            })}
          </div>

          <ol className="flex flex-col gap-2">
            {stats.players.map((p, index) => (
              <li key={p.name} className="flex flex-col gap-2 rounded-2xl bg-panel p-3">
                <div className="flex items-baseline gap-3">
                  <span className="w-6 font-display text-muted">{index + 1}.</span>
                  <span className="flex-1 truncate text-lg font-extrabold">{p.name}</span>
                  <span className="font-display text-xl">{p.points}</span>
                  <span className="text-xs font-bold text-muted">pts</span>
                </div>
                <dl className="grid grid-cols-4 gap-1 text-center text-xs font-bold text-muted">
                  <Stat label="Games" value={p.games} />
                  <Stat label="Wins" value={p.wins} />
                  <Stat label="Impostor" value={p.impostor_rounds} />
                  <Stat label="Escaped" value={p.escaped} />
                </dl>
              </li>
            ))}
          </ol>
        </>
      )}
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-ink px-1 py-1.5">
      <dd className="font-display text-base text-white">{value}</dd>
      <dt>{label}</dt>
    </div>
  )
}
