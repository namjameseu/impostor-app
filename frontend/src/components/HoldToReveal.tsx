import { useEffect, useState, type ReactNode } from 'react'
import { Spinner } from './Spinner'

interface HoldToRevealProps {
  /** Rendered only while the pad is held down. */
  children: ReactNode
  onRevealed?: () => void
  disabled?: boolean
  /** Show a spinner instead of the prompt (e.g. while the role is being fetched). */
  loading?: boolean
}

/**
 * Press-and-hold pad: secret content is mounted only while a finger/mouse/key is down,
 * and is unmounted the instant it is released, cancelled, or the page loses focus.
 */
export function HoldToReveal({
  children,
  onRevealed,
  disabled = false,
  loading = false,
}: HoldToRevealProps) {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const hide = () => setHeld(false)
    window.addEventListener('blur', hide)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('blur', hide)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [])

  const press = () => {
    if (disabled) return
    setHeld(true)
    onRevealed?.()
  }
  const release = () => setHeld(false)

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Hold to reveal your role"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        press()
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          press()
        }
      }}
      onKeyUp={release}
      onBlur={release}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: 'none', touchAction: 'none' }}
      className={`relative flex min-h-80 w-full flex-col items-center justify-center overflow-hidden rounded-3xl border-4 p-6 select-none transition-colors ${loading ? '' : 'disabled:opacity-50'} ${
        held ? 'border-white/30 bg-panel-2' : 'border-dashed border-line bg-panel'
      }`}
    >
      {held ? (
        <div className="animate-pop">{children}</div>
      ) : loading ? (
        <div role="status" className="flex flex-col items-center gap-4 text-muted">
          <Spinner size="lg" className="text-accent" />
          <span className="font-extrabold">Getting your role…</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-muted">
          <FingerprintIcon />
          <span className="font-display text-2xl text-white">Hold to reveal</span>
          <span className="text-sm font-bold">Release to hide</span>
        </div>
      )}
    </button>
  )
}

function FingerprintIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 11c0 3.5-1 6.5-3 9" />
      <path d="M8.5 6.5A6 6 0 0 1 18 11c0 2-.3 4-1 6" />
      <path d="M6 9.5A6 6 0 0 0 6 11c0 1.5-.4 3-1 4" />
      <path d="M15 11a3 3 0 0 0-6 0c0 2.5-.5 5-1.5 7" />
      <path d="M12 21c1.2-2 2-4.5 2.5-7" />
      <path d="M4.5 6A9 9 0 0 1 20 7.5" />
    </svg>
  )
}
