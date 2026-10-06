import { useEffect, useId, useRef, useState } from 'react'
import type { Category } from '../types/api'
import { OptionButton } from './OptionGroup'
import { revealAboveActions } from '../utils/scroll'
import { Loading } from './Spinner'

interface CategoryPickerProps {
  /** null while loading */
  categories: Category[] | null
  isRandom: boolean
  selectedIds: number[]
  onRandom: () => void
  onToggle: (id: number) => void
}

/** Compact dropdown: one summary row; the choices open in their own scrollable panel. */
export function CategoryPicker({ categories, isRandom, selectedIds, onRandom, onToggle }: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  // Opening near the bottom of the screen: bring the whole panel (and Done) into view.
  useEffect(() => {
    if (open && panelRef.current) revealAboveActions(panelRef.current)
  }, [open])
  const selectedNames = (categories ?? []).filter((c) => selectedIds.includes(c.id)).map((c) => c.name)

  const summary = isRandom
    ? '🎲 Random'
    : selectedNames.length <= 2
      ? selectedNames.join(', ')
      : `${selectedNames.slice(0, 2).join(', ')} +${selectedNames.length - 2}`
  const detail = isRandom
    ? 'All categories mixed'
    : `Mixing ${selectedNames.length} ${selectedNames.length === 1 ? 'category' : 'categories'}`

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="mb-2 text-sm font-extrabold tracking-widest text-muted uppercase">Categories</span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-2 text-left transition-colors ${
          open ? 'border-accent bg-accent/10' : 'border-line bg-panel'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-extrabold">{categories === null ? 'Loading…' : summary}</span>
          <span className="block text-xs font-bold text-muted">{detail}</span>
        </span>
        <span aria-hidden="true" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <div ref={panelRef} id={panelId} className="animate-rise overflow-hidden rounded-xl border-2 border-line bg-ink">
          <div className="max-h-72 overflow-y-auto overscroll-contain p-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <OptionButton selected={isRandom} label="🎲 Random" hint="All categories" onClick={onRandom} />
              </div>
              {categories === null && <Loading label="Loading categories…" className="col-span-2 py-6" />}
              {categories?.map((c) => {
                const selected = !isRandom && selectedIds.includes(c.id)
                return (
                  <OptionButton
                    key={c.id}
                    selected={selected}
                    label={`${selected ? '✓ ' : ''}${c.name}`}
                    hint={`${c.word_count} words`}
                    onClick={() => onToggle(c.id)}
                  />
                )
              })}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-3 py-2">
            <span className="text-xs font-bold text-muted">Pick one or more to mix</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-10 rounded-lg bg-accent px-4 font-display text-sm text-ink uppercase"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
