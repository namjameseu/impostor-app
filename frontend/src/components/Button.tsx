import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'crew'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-ink shadow-[0_6px_0_#6d4fd1] active:shadow-[0_2px_0_#6d4fd1]',
  crew: 'bg-crew text-ink shadow-[0_6px_0_#0e8ea3] active:shadow-[0_2px_0_#0e8ea3]',
  danger: 'bg-impostor text-white shadow-[0_6px_0_#a8183a] active:shadow-[0_2px_0_#a8183a]',
  secondary: 'bg-panel-2 text-white shadow-[0_6px_0_#120f26] active:shadow-[0_2px_0_#120f26]',
  ghost: 'bg-transparent text-muted hover:text-white',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'lg'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const sizing = size === 'lg' ? 'min-h-16 px-6 text-xl' : 'min-h-12 px-4 text-base'
  const motion = variant === 'ghost' ? '' : 'active:translate-y-1'
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex w-full items-center justify-center gap-2 rounded-2xl font-display uppercase tracking-wide transition-[transform,box-shadow,opacity] disabled:pointer-events-none disabled:opacity-40 aria-busy:opacity-80 ${sizing} ${motion} ${VARIANTS[variant]} ${className}`}
    >
      {/* Keep the label in place (invisible) so the button doesn't change size while loading. */}
      <span className={`inline-flex items-center gap-2 ${loading ? 'invisible' : ''}`}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" />
        </span>
      )}
    </button>
  )
}
