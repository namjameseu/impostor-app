import { useState } from 'react'
import { MAX_ROUNDS, MIN_ROUNDS, ROUND_PRESETS, parseRounds } from '../utils/rounds'
import { OptionButton } from './OptionGroup'

interface RoundsInputProps {
  value: number
  /** Called with the new round count, or null while the typed text is not a valid count. */
  onChange: (rounds: number | null) => void
}

export function RoundsInput({ value, onChange }: RoundsInputProps) {
  // Raw text while the user is typing; null means "show the current value".
  const [draft, setDraft] = useState<string | null>(null)
  const invalid = draft !== null && parseRounds(draft) === null

  const set = (rounds: number) => {
    setDraft(null)
    onChange(rounds)
  }

  const type = (text: string) => {
    setDraft(text)
    onChange(parseRounds(text))
  }

  const stepClass =
    'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-line bg-panel font-display text-2xl text-white disabled:opacity-30'

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-extrabold tracking-widest text-muted uppercase">Rounds</legend>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Fewer rounds"
          disabled={invalid || value <= MIN_ROUNDS}
          onClick={() => set(value - 1)}
          className={stepClass}
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          aria-label="Number of rounds"
          aria-invalid={invalid}
          size={3}
          value={draft ?? String(value)}
          onChange={(e) => type(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => !invalid && setDraft(null)}
          className={`h-14 w-0 min-w-0 flex-1 rounded-xl border-2 bg-ink text-center font-display text-3xl text-white focus:outline-none ${
            invalid ? 'border-impostor' : 'border-line focus:border-accent'
          }`}
        />
        <button
          type="button"
          aria-label="More rounds"
          disabled={invalid || value >= MAX_ROUNDS}
          onClick={() => set(value + 1)}
          className={stepClass}
        >
          +
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ROUND_PRESETS.map((n) => (
          <OptionButton key={n} selected={!invalid && value === n} label={String(n)} onClick={() => set(n)} />
        ))}
      </div>
      {invalid && (
        <p role="alert" className="text-sm font-bold text-rose-300">
          Enter a number from {MIN_ROUNDS} to {MAX_ROUNDS}.
        </p>
      )}
    </fieldset>
  )
}
