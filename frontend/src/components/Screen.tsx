import { useContext, type ReactNode } from 'react'
import { ScreenHeaderContext } from './screenHeader'

interface ScreenProps {
  children: ReactNode
  /** Sticky bottom area for the main action(s), reachable with one thumb. */
  actions?: ReactNode
  header?: ReactNode
  center?: boolean
}

export function Screen({ children, actions, header, center = false }: ScreenProps) {
  const contextHeader = useContext(ScreenHeaderContext)
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      {header ?? contextHeader}
      <main
        className={`flex flex-1 flex-col gap-6 py-6 ${center ? 'items-center justify-center text-center' : ''}`}
      >
        {children}
      </main>
      {actions && (
        <div data-screen-actions className="sticky bottom-0 -mx-4 flex flex-col gap-3 bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {actions}
        </div>
      )}
    </div>
  )
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-sm font-extrabold tracking-[0.25em] text-muted uppercase">{children}</p>
}

export function BigName({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={`font-display text-5xl leading-tight break-words sm:text-6xl ${className}`}>
      {children}
    </h1>
  )
}
