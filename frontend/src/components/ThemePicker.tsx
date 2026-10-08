import { useState } from 'react'
import { THEMES, applyTheme, loadTheme, type ThemeId } from '../utils/theme'
import { Modal } from './Modal'

/** Palette button that opens a picker for the app's colour theme (remembered on this device). */
export function ThemeButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change theme colour"
        className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-line bg-panel text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path
            strokeLinejoin="round"
            d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2Z"
          />
          <circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && <ThemePicker onClose={() => setOpen(false)} />}
    </>
  )
}

function ThemePicker({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<ThemeId>(loadTheme)

  const choose = (id: ThemeId) => {
    applyTheme(id)
    setCurrent(id)
  }

  return (
    <Modal title="Theme colour" onClose={onClose}>
      <div role="radiogroup" aria-label="Theme colour" className="grid grid-cols-5 gap-2">
        {THEMES.map((theme) => {
          const selected = theme.id === current
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(theme.id)}
              className="flex flex-col items-center gap-2 rounded-xl py-2 text-xs font-extrabold text-muted aria-checked:text-white"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full border-4 text-lg font-black ${
                  selected ? 'border-white' : 'border-transparent'
                }`}
                style={{ background: `linear-gradient(135deg, ${theme.accent} 50%, ${theme.ink} 50%)` }}
              >
                {selected && <span className="text-white drop-shadow">✓</span>}
              </span>
              {theme.name}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
