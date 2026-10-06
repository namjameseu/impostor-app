interface Option<T> {
  value: T
  label: string
  hint?: string
}

interface OptionGroupProps<T> {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  columns?: number
}

export function OptionGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  columns = options.length,
}: OptionGroupProps<T>) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-extrabold tracking-widest text-muted uppercase">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          return (
            <OptionButton
              key={option.value}
              selected={option.value === value}
              label={option.label}
              hint={option.hint}
              onClick={() => onChange(option.value)}
            />
          )
        })}
      </div>
    </fieldset>
  )
}

interface OptionButtonProps {
  selected: boolean
  label: string
  hint?: string
  onClick: () => void
}

export function OptionButton({ selected, label, hint, onClick }: OptionButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-14 rounded-xl border-2 px-3 py-2 text-left font-extrabold transition-colors ${
        selected ? 'border-accent bg-accent/20 text-white' : 'border-line bg-panel text-muted hover:text-white'
      }`}
    >
      <span className="block">{label}</span>
      {hint && <span className="block text-xs font-bold text-muted">{hint}</span>}
    </button>
  )
}
