import { useCallback, useEffect, useState } from 'react'
import { ADMIN_LOCKED_EVENT, adminApi, getAdminPasscode, setAdminPasscode } from '../services/api'

/** Whether the word library can be edited, and unlocking it with the admin passcode. */
export function useAdmin() {
  const [required, setRequired] = useState<boolean | null>(null)
  const [unlocked, setUnlocked] = useState(() => getAdminPasscode() !== null)

  useEffect(() => {
    adminApi
      .status()
      .then((s) => setRequired(s.passcode_required))
      .catch(() => setRequired(false))
    const lock = () => setUnlocked(false)
    window.addEventListener(ADMIN_LOCKED_EVENT, lock)
    return () => window.removeEventListener(ADMIN_LOCKED_EVENT, lock)
  }, [])

  const unlock = useCallback(async (passcode: string) => {
    await adminApi.verify(passcode)
    setAdminPasscode(passcode)
    setUnlocked(true)
  }, [])

  const lock = useCallback(() => {
    setAdminPasscode(null)
    setUnlocked(false)
  }, [])

  return {
    /** null while checking */
    passcodeRequired: required,
    canEdit: required === false || (required === true && unlocked),
    unlocked: required === true && unlocked,
    unlock,
    lock,
  }
}
