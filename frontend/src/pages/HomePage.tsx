import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { gameApi } from '../services/api'
import { useSetup } from '../stores/setupContext'

export function HomePage() {
  const navigate = useNavigate()
  const { activeGameId, setActiveGameId } = useSetup()
  const [resumable, setResumable] = useState(false)
  const installPrompt = useInstallPrompt()

  useEffect(() => {
    if (activeGameId === null) return
    gameApi
      .get(activeGameId)
      .then((game) => setResumable(game.state !== 'GAME_RESULTS'))
      .catch(() => setActiveGameId(null))
  }, [activeGameId, setActiveGameId])

  return (
    <Screen
      center
      actions={
        <>
          {resumable && (
            <Button variant="crew" onClick={() => navigate(`/game/${activeGameId}`)}>
              Resume game
            </Button>
          )}
          <Button onClick={() => navigate('/setup')}>New game</Button>
          {installPrompt.canInstall && (
            <Button variant="secondary" size="md" onClick={installPrompt.install}>
              📲 Install app
            </Button>
          )}
          {installPrompt.showIosHint && (
            <p className="text-center text-sm font-bold text-muted">
              📲 Install: tap <span className="text-white">Share</span>, then{' '}
              <span className="text-white">Add to Home Screen</span>
            </p>
          )}
          <div className="grid grid-cols-2">
            <Link
              to="/library"
              className="flex min-h-14 items-center justify-center font-display text-base tracking-wide text-muted uppercase hover:text-white"
            >
              Word library
            </Link>
            <Link
              to="/stats"
              className="flex min-h-14 items-center justify-center font-display text-base tracking-wide text-muted uppercase hover:text-white"
            >
              Player stats
            </Link>
          </div>
        </>
      }
    >
      <div className="flex animate-pop flex-col items-center gap-6">
        <img src="/favicon.svg" alt="" className="h-28 w-28 drop-shadow-[0_0_40px_rgba(244,63,94,0.45)]" />
        <h1 className="font-display text-6xl tracking-tight sm:text-7xl">
          IMPOS<span className="text-impostor">T</span>OR
        </h1>
        {/* <p className="max-w-xs text-lg font-bold text-muted">
          One phone. One secret word. One of you is lying.
        </p> */}
      </div>
    </Screen>
  )
}
