const SIZES = { sm: 'h-5 w-5 border-[3px]', md: 'h-8 w-8 border-4', lg: 'h-12 w-12 border-4' }

interface SpinnerProps {
  size?: keyof typeof SIZES
  className?: string
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent ${SIZES[size]} ${className}`}
    />
  )
}

/** Centered spinner with a label, for sections or screens waiting on the server. */
export function Loading({ label = 'Loading…', className = '' }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-3 py-8 text-muted ${className}`}>
      <Spinner size="lg" className="text-accent" />
      <span className="text-sm font-extrabold">{label}</span>
    </div>
  )
}
