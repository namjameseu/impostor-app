// Mirrors the backend's GameSettings.total_rounds limits.
export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 50
export const ROUND_PRESETS = [3, 5, 10]

/** Parses typed input; returns null unless it's a whole number within the limits. */
export function parseRounds(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return n >= MIN_ROUNDS && n <= MAX_ROUNDS ? n : null
}
