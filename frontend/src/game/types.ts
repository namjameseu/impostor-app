import type {
  CategoryMode,
  GameState,
  ImpostorHint,
  ImpostorMode,
  RoundOutcome,
} from '../types/api'

/** Internal, always-fully-populated persisted shape. `gameStore.toGameRead` projects the
 * public, state-gated view from this (secret_word/impostor_ids etc. stay null in that view
 * until the state allows showing them) — same split as backend/app/models/{game,round}.py vs
 * backend/app/services/game_service.py's `to_game_read`. */

export interface InternalPlayer {
  id: number
  name: string
  order_index: number
  score: number
  active: boolean
}

export interface InternalImpostor {
  player_id: number
  guessed_word: boolean | null
}

export interface InternalRound {
  round_number: number
  category_name: string
  word_id: number | null
  secret_word: string
  impostor_word: string | null
  /** A single loosely-associated word for Word Hint mode; snapshotted like the rest of the round. */
  word_hint: string | null
  starting_player_id: number
  reveal_index: number
  suspect_ids: number[]
  impostors: InternalImpostor[]
  word_revealed: boolean
  outcome: RoundOutcome | null
  points: Record<number, number> | null
  completed_at: string | null
}

export interface InternalGame {
  id: number
  state: GameState
  total_rounds: number
  category_mode: CategoryMode
  /** Snapshot of the chosen categories (empty for random mode), same rationale as the
   * backend's stored `game.categories` relationship: library edits shouldn't rewrite history. */
  categories: { id: number; name: string }[]
  impostor_hint: ImpostorHint
  impostor_count: number
  impostors_know_each_other: boolean
  impostor_mode: ImpostorMode
  current_round_number: number
  finished_at: string | null
  /** Counter for the next GamePlayer-equivalent id, mirroring the DB's autoincrement. */
  next_player_id: number
  players: InternalPlayer[]
  rounds: InternalRound[]
}
