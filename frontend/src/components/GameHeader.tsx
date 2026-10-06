import { useNavigate } from 'react-router-dom'
import type { Game } from '../types/api'

export function GameHeader({ game }: { game: Game }) {
  const navigate = useNavigate()
  const quit = () => {
    if (window.confirm('Leave this game? You can resume it from the home screen.')) navigate('/')
  }
  return (
    <header className="flex items-center justify-between pt-1">
      <button type="button" onClick={quit} className="min-h-11 px-1 text-sm font-extrabold text-muted hover:text-white">
        ✕ Quit
      </button>
      {game.current_round_number > 0 && (
        <span className="rounded-full bg-panel px-3 py-1 text-sm font-extrabold text-muted">
          Round {game.current_round_number}/{game.total_rounds}
        </span>
      )}
    </header>
  )
}
