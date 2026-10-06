import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md animate-rise rounded-t-3xl border border-line bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-2xl text-muted hover:text-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const inputClass =
  'w-full min-h-12 rounded-xl border-2 border-line bg-ink px-4 text-lg font-bold text-white placeholder:text-muted/60 focus:border-accent focus:outline-none'
