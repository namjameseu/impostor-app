export type Difficulty = 'easy' | 'medium' | 'hard'
export type CategoryMode = 'random' | 'specific'
export type ImpostorHint = 'none' | 'category'
export type RoundOutcome = 'group_wins' | 'impostors_win' | 'split'

export type GameState =
  | 'SETUP'
  | 'ROLE_REVEAL'
  | 'READY'
  | 'CLUE_ROUND'
  | 'VOTING'
  | 'IMPOSTOR_REVEAL'
  | 'FINAL_GUESS'
  | 'ROUND_RESULTS'
  | 'GAME_RESULTS'

export interface Category {
  id: number
  name: string
  description: string | null
  enabled: boolean
  word_count: number
  created_at: string
  updated_at: string
}

export interface CategoryInput {
  name: string
  description: string | null
  enabled?: boolean
}

export interface Word {
  id: number
  category_id: number
  category_name: string
  word: string
  difficulty: Difficulty
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface WordInput {
  category_id: number
  word: string
  difficulty: Difficulty
  enabled?: boolean
}

export interface WordFilters {
  category_id?: number
  difficulty?: Difficulty
  search?: string
}

export interface GameSettings {
  total_rounds: number
  category_mode: CategoryMode
  /** Categories to mix when category_mode is 'specific'. Empty for random. */
  category_ids: number[]
  impostor_hint: ImpostorHint
  impostor_count: number
  impostors_know_each_other: boolean
}

export interface Player {
  id: number
  name: string
  order_index: number
  score: number
}

/** Public round data. Secret fields are null until the backend allows showing them. */
export interface Round {
  round_number: number
  starting_player_id: number
  revealer_id: number | null
  next_revealer_id: number | null
  revealed_count: number
  suspect_ids: number[]
  impostor_ids: number[] | null
  caught_impostor_ids: number[] | null
  word_revealed: boolean
  secret_word: string | null
  category: string | null
  guessed_word_ids: number[] | null
  outcome: RoundOutcome | null
  points: Record<string, number> | null
  explanation: string | null
}

export interface Game {
  id: number
  state: GameState
  total_rounds: number
  current_round_number: number
  settings: GameSettings & { categories: { id: number; name: string }[] }
  players: Player[]
  round: Round | null
}

export type PlayerRole =
  | { role: 'player'; category: string; word: string }
  | { role: 'impostor'; category?: string; fellow_impostors?: string[] }

export interface Standing {
  rank: number
  player_id: number
  name: string
  score: number
}

export interface RoundSummary {
  round_number: number
  category: string
  secret_word: string
  impostor_ids: number[]
  impostor_names: string[]
  suspect_ids: number[]
  outcome: RoundOutcome
  explanation: string
}

export interface GameResults {
  game_id: number
  state: GameState
  standings: Standing[]
  rounds: RoundSummary[]
}
