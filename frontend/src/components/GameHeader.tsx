import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Game } from '../types/api'
import { setSoundEnabled, soundEnabled } from '../utils/feedback'
import { Button } from './Button'
import { Modal } from './Modal'

export function GameHeader({ game }: { game: Game }) {
  const navigate = useNavigate()
  const [sound, setSound] = useState(soundEnabled)
  const [confirmingQuit, setConfirmingQuit] = useState(false)
  const toggleSound = () => {
    setSoundEnabled(!sound)
    setSound(!sound)
  }
  return (
    <header className="flex items-center justify-between gap-2 pt-1">
      <button
        type="button"
        onClick={() => setConfirmingQuit(true)}
        className="min-h-11 px-1 text-sm font-extrabold text-muted hover:text-white"
      >
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
      {confirmingQuit && (
        <Modal title="Leave this game?" onClose={() => setConfirmingQuit(false)}>
          <p className="mb-5 text-lg font-bold text-muted">You can resume it from the home screen.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="md" onClick={() => setConfirmingQuit(false)}>
              Stay
            </Button>
            <Button variant="danger" size="md" onClick={() => navigate('/')}>
              Leave
            </Button>
          </div>
        </Modal>
      )}
    </header>
  )
}
