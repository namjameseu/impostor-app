import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Applies new deploys. Installed apps (especially on iPhone) have no reload button, so:
 * - check for a new version whenever the app is opened or brought back to the foreground;
 * - outside a game, switch to it straight away;
 * - during a game, never reload on our own - offer a "Refresh" button instead.
 */
export function UpdatePrompt() {
  const { pathname } = useLocation()
  const inGame = pathname.startsWith('/game/')
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', check)
      setInterval(check, 30 * 60 * 1000)
    },
  })

  useEffect(() => {
    if (needRefresh && !inGame) void updateServiceWorker(true)
  }, [needRefresh, inGame, updateServiceWorker])

  if (!needRefresh || !inGame) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="rounded-full border border-accent/60 bg-panel px-4 py-2 text-sm font-extrabold text-white shadow-lg"
      >
        ✨ Update ready · <span className="text-accent">Refresh</span>
      </button>
    </div>
  )
}
