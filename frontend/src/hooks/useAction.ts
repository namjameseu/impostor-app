import { useCallback, useState } from 'react'

/** Runs an async action with a pending flag and a user-facing error message. */
export function useAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setPending(true)
    setError(null)
    try {
      return await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      return undefined
    } finally {
      setPending(false)
    }
  }, [])

  return { run, pending, error, setError }
}
