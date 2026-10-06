import type {
  Category,
  CategoryInput,
  Game,
  GameResults,
  GameSettings,
  PlayerRole,
  Stats,
  Word,
  WordFilters,
  WordInput,
} from '../types/api'
import { loadSession, saveSession } from '../utils/storage'

const PASSCODE_KEY = 'impostor.adminPasscode'
export const ADMIN_LOCKED_EVENT = 'impostor:admin-locked'

export const getAdminPasscode = () => loadSession(PASSCODE_KEY)
export const setAdminPasscode = (passcode: string | null) => saveSession(PASSCODE_KEY, passcode)

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function errorMessage(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string }
    if (first.msg) return first.msg.replace(/^Value error, /, '')
  }
  return fallback
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const passcode = getAdminPasscode()
    if (passcode) headers['X-Admin-Passcode'] = passcode
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection and try again.")
  }
  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)
  if (response.status === 401 && path !== '/admin/verify') {
    // Passcode missing or changed on the server: forget it so the UI locks again.
    setAdminPasscode(null)
    window.dispatchEvent(new Event(ADMIN_LOCKED_EVENT))
  }
  if (!response.ok) throw new ApiError(response.status, errorMessage(data, response.statusText))
  return data as T
}

function query(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

const current = (gameId: number) => `/games/${gameId}/rounds/current`

export const libraryApi = {
  listCategories: (includeDisabled = true) =>
    request<Category[]>('GET', `/categories${query({ include_disabled: includeDisabled })}`),
  createCategory: (data: CategoryInput) => request<Category>('POST', '/categories', data),
  updateCategory: (id: number, data: Partial<CategoryInput>) =>
    request<Category>('PATCH', `/categories/${id}`, data),

  listWords: (filters: WordFilters = {}) => request<Word[]>('GET', `/words${query(filters)}`),
  createWord: (data: WordInput) => request<Word>('POST', '/words', data),
  updateWord: (id: number, data: Partial<WordInput>) =>
    request<Word>('PATCH', `/words/${id}`, data),
  deleteWord: (id: number) => request<void>('DELETE', `/words/${id}`),
}

export const statsApi = {
  forGames: (gameIds: number[]) =>
    request<Stats>('GET', `/stats?${gameIds.map((id) => `game_ids=${id}`).join('&')}`),
}

export const adminApi = {
  status: () => request<{ passcode_required: boolean }>('GET', '/admin/status'),
  verify: (passcode: string) => request<void>('POST', '/admin/verify', { passcode }),
}

export const gameApi = {
  create: (players: string[], settings: GameSettings) =>
    request<Game>('POST', '/games', { players, settings }),
  get: (gameId: number) => request<Game>('GET', `/games/${gameId}`),
  start: (gameId: number) => request<Game>('POST', `/games/${gameId}/start`),
  /** Setup or between rounds only. */
  addPlayer: (gameId: number, name: string) =>
    request<Game>('POST', `/games/${gameId}/players`, { name }),
  removePlayer: (gameId: number, playerId: number) =>
    request<Game>('DELETE', `/games/${gameId}/players/${playerId}`),

  getRole: (gameId: number, playerId: number) =>
    request<PlayerRole>('GET', `${current(gameId)}/players/${playerId}/role`),
  completeReveal: (gameId: number, playerId: number) =>
    request<Game>('POST', `${current(gameId)}/players/${playerId}/reveal-complete`),

  startClues: (gameId: number) => request<Game>('POST', `${current(gameId)}/start-clues`),
  startVoting: (gameId: number) => request<Game>('POST', `${current(gameId)}/start-voting`),
  selectSuspects: (gameId: number, playerIds: number[]) =>
    request<Game>('PUT', `${current(gameId)}/suspects`, { player_ids: playerIds }),
  revealImpostors: (gameId: number) =>
    request<Game>('POST', `${current(gameId)}/reveal-impostors`),
  revealWord: (gameId: number) => request<Game>('POST', `${current(gameId)}/reveal-word`),
  /** `correctPlayerIds`: caught Impostors whose spoken guess was right. */
  recordFinalGuess: (gameId: number, correctPlayerIds: number[]) =>
    request<Game>('POST', `${current(gameId)}/final-guess`, {
      correct_player_ids: correctPlayerIds,
    }),

  nextRound: (gameId: number) => request<Game>('POST', `/games/${gameId}/rounds`),
  finish: (gameId: number) => request<Game>('POST', `/games/${gameId}/finish`),
  results: (gameId: number) => request<GameResults>('GET', `/games/${gameId}/results`),
  playAgain: (gameId: number) => request<Game>('POST', `/games/${gameId}/play-again`),
}
