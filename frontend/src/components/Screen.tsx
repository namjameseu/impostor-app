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
  const content = (
    <>
      {header ?? contextHeader}
      <main className={`flex flex-1 flex-col py-6 ${center ? '' : 'gap-6'}`}>
        {center ? (
          // m-auto (not justify-center) so overflowing content anchors to the top instead of
          // being clipped there - iOS Safari won't let the page scroll above a centered item.
          <div className="m-auto flex w-full flex-col items-center gap-6 text-center">{children}</div>
        ) : (
          children
        )}
      </main>
    </>
  )
  const top = 'px-4 pt-[max(1rem,env(safe-area-inset-top))]'

  if (!actions) {
    return <div className={`mx-auto flex min-h-dvh w-full max-w-md flex-col ${top}`}>{content}</div>
  }
  // With pinned actions the screen is exactly one viewport tall and only the content scrolls.
  // (A sticky footer on a window-scrolled page drifts up the screen on iPhone when Safari's
  // toolbar collapses at the bottom of a long page.)
  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col">
      <div data-screen-scroll className={`flex flex-1 flex-col overflow-y-auto overscroll-contain ${top}`}>
        {content}
      </div>
      <div data-screen-actions className="relative -mt-6 flex flex-col gap-3 bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {actions}
      </div>
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
