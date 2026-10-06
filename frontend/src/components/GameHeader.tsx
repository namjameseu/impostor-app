import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Game } from '../types/api'
import { setSoundEnabled, soundEnabled } from '../utils/feedback'

export function GameHeader({ game }: { game: Game }) {
  const navigate = useNavigate()
  const [sound, setSound] = useState(soundEnabled)
  const quit = () => {
    if (window.confirm('Leave this game? You can resume it from the home screen.')) navigate('/')
  }
  const toggleSound = () => {
    setSoundEnabled(!sound)
    setSound(!sound)
  }
  return (
    <header className="flex items-center justify-between gap-2 pt-1">
      <button type="button" onClick={quit} className="min-h-11 px-1 text-sm font-extrabold text-muted hover:text-white">
        ✕ Quit
      </button>
      <div className="flex items-center gap-2">
        {game.current_round_number > 0 && (
          <span className="rounded-full bg-panel px-3 py-1 text-sm font-extrabold text-muted">
            Round {game.current_round_number}/{game.total_rounds}
          </span>
        )}
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={sound}
          aria-label={sound ? 'Turn sound and vibration off' : 'Turn sound and vibration on'}
          className="flex h-11 w-11 items-center justify-center rounded-full text-lg hover:bg-panel"
        >
          {sound ? '🔊' : '🔇'}
        </button>
      </div>
    </header>
  )
}
