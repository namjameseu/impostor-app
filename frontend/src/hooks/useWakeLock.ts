import { useEffect } from 'react'

/** Keep the screen on while mounted (e.g. during a game), where the browser supports it. */
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let active = true

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        lock = await navigator.wakeLock.request('screen')
        if (!active) await lock.release()
      } catch {
        // Denied (e.g. battery saver) - the game still works, the screen may just dim.
      }
    }

    // The lock is dropped whenever the page is hidden; take it again when it comes back.
    const onVisibility = () => void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    void acquire()
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibility)
      void lock?.release().catch(() => {})
    }
  }, [])
}
