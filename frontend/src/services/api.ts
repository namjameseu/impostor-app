import type {
  Category,
  CategoryInput,
  Game,
  GameResults,
  GameSettings,
  PlayerRole,
  Word,
  WordFilters,
  WordInput,
} from '../types/api'

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
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the backend running?')
  }
  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)
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

export const gameApi = {
  create: (players: string[], settings: GameSettings) =>
    request<Game>('POST', '/games', { players, settings }),
  get: (gameId: number) => request<Game>('GET', `/games/${gameId}`),
  start: (gameId: number) => request<Game>('POST', `/games/${gameId}/start`),

  getRole: (gameId: number, playerId: number) =>
    request<PlayerRole>('GET', `${current(gameId)}/players/${playerId}/role`),
  completeReveal: (gameId: number, playerId: number) =>
    request<Game>('POST', `${current(gameId)}/players/${playerId}/reveal-complete`),

  startClues: (gameId: number) => request<Game>('POST', `${current(gameId)}/start-clues`),
  startVoting: (gameId: number) => request<Game>('POST', `${current(gameId)}/start-voting`),
  selectSuspect: (gameId: number, playerId: number) =>
    request<Game>('PUT', `${current(gameId)}/suspect`, { player_id: playerId }),
  revealImpostor: (gameId: number) => request<Game>('POST', `${current(gameId)}/reveal-impostor`),
  revealWord: (gameId: number) => request<Game>('POST', `${current(gameId)}/reveal-word`),
  recordFinalGuess: (gameId: number, correct: boolean) =>
    request<Game>('POST', `${current(gameId)}/final-guess`, { correct }),

  nextRound: (gameId: number) => request<Game>('POST', `/games/${gameId}/rounds`),
  finish: (gameId: number) => request<Game>('POST', `/games/${gameId}/finish`),
  results: (gameId: number) => request<GameResults>('GET', `/games/${gameId}/results`),
  playAgain: (gameId: number) => request<Game>('POST', `/games/${gameId}/play-again`),
}
