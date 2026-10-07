import { useState } from 'react'
import { setSoundEnabled, soundEnabled } from '../utils/feedback'

/** Speaker button that mutes/unmutes sound and vibration app-wide (remembered on this device). */
export function SoundButton() {
  const [sound, setSound] = useState(soundEnabled)

  const toggle = () => {
    setSoundEnabled(!sound)
    setSound(!sound)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={sound}
      aria-label={sound ? 'Turn sound and vibration off' : 'Turn sound and vibration on'}
      className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-line bg-panel text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {sound ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9v6h4l5 5V4l-5 5H4z" fill="currentColor" stroke="none" />
          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9v6h4l5 5V4l-5 5H4z" fill="currentColor" stroke="none" />
          <path d="M16 9l5 6M21 9l-5 6" />
        </svg>
      )}
    </button>
  )
}
