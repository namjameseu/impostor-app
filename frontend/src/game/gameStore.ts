/** Game orchestration: loads/saves local game state and delegates every rule to this
 * directory's other modules. Port of backend/app/services/game_service.py — every game
 * action a screen takes (via services/api.ts's `gameApi`) lands here instead of `/api/games`. */
import { loadJson, saveJson } from '../utils/storage'
import type { Game, GameResults, GameSettings, PlayerRole, RoundOutcome, RoundSummary } from '../types/api'
import { GameValidationError, InvalidStateError, NotFoundError, RoleAccessError } from './errors'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  hasMoreRounds,
  isImpostorVisible,
  isWordVisible,
  maxImpostors,
  requireState,
  transition,
  validateImpostorCount,
  validatePlayerNames,
} from './gameEngine'
import { buildRoleView, chooseImpostors, chooseStartingPlayer } from './roundManager'
import { impostorResult, explainRound, rankPlayers, roundOutcome, roundPoints, type ImpostorResult } from './scoring'
import type { InternalGame, InternalPlayer, InternalRound } from './types'
import { loadWordBank, type BankCategory } from './wordBank'
import { chooseImpostorWord, selectWord, type WordCandidate } from './wordSelector'

const gameKey = (id: number) => `impostor.game.${id}`
const NEXT_ID_KEY = 'impostor.nextGameId'

function nextGameId(): number {
  const id = loadJson<number>(NEXT_ID_KEY, 1)
  saveJson(NEXT_ID_KEY, id + 1)
  return id
}

function loadGame(gameId: number): InternalGame {
  const game = loadJson<InternalGame | null>(gameKey(gameId), null)
  if (game === null) throw new NotFoundError('Game not found.')
  return game
}

function saveGame(game: InternalGame): void {
  saveJson(gameKey(game.id), game)
}

/** Players taking part from now on, in turn order (excludes anyone who left). */
function activePlayers(game: InternalGame): InternalPlayer[] {
  return game.players.filter((p) => p.active)
}

function findPlayer(game: InternalGame, playerId: number): InternalPlayer {
  const player = activePlayers(game).find((p) => p.id === playerId)
  if (!player) throw new NotFoundError('Player not found in this game.')
  return player
}

function currentRound(game: InternalGame): InternalRound {
  if (!game.rounds.length) throw new InvalidStateError('The game has not started yet.')
  return game.rounds[game.rounds.length - 1]
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function createGame(names: string[], settings: GameSettings): Promise<Game> {
  const cleaned = validatePlayerNames(names)
  validateImpostorCount(settings.impostor_count, cleaned.length)

  let categories: { id: number; name: string }[] = []
  if (settings.category_mode === 'specific') {
    const bank = await loadWordBank()
    const wantedIds = [...new Set(settings.category_ids)]
    categories = bank.filter((c) => wantedIds.includes(c.id)).map((c) => ({ id: c.id, name: c.name }))
    if (categories.length !== wantedIds.length) {
      throw new GameValidationError("A selected category does not exist or is disabled.")
    }
  }

  // Impostors don't know they're Impostors in Similar Word mode, so they can't know each other.
  const impostorsKnowEachOther =
    settings.impostor_mode === 'similar_word' ? false : settings.impostors_know_each_other

  const game: InternalGame = {
    id: nextGameId(),
    state: 'SETUP',
    total_rounds: settings.total_rounds,
    category_mode: settings.category_mode,
    categories,
    impostor_hint: settings.impostor_hint,
    impostor_count: settings.impostor_count,
    impostors_know_each_other: impostorsKnowEachOther,
    impostor_mode: settings.impostor_mode,
    current_round_number: 0,
    finished_at: null,
    next_player_id: cleaned.length + 1,
    players: cleaned.map((name, index) => ({
      id: index + 1,
      name,
      order_index: index,
      score: 0,
      active: true,
    })),
    rounds: [],
  }
  saveGame(game)
  return toGameRead(game)
}

export async function startGame(gameId: number): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, ['SETUP'], 'start the game')
  await generateRound(game)
  saveGame(game)
  return toGameRead(game)
}

/** Create a fresh game with the same players (in order) and settings. */
export async function playAgain(gameId: number): Promise<Game> {
  const old = loadGame(gameId)
  requireState(old.state, ['GAME_RESULTS'], 'play again')
  const bank = await loadWordBank()
  // Drop categories disabled/removed since; fall back to random if none are left.
  const availableIds = old.categories.map((c) => c.id).filter((id) => bank.some((c) => c.id === id))
  const settings: GameSettings = {
    total_rounds: old.total_rounds,
    category_mode: availableIds.length ? 'specific' : 'random',
    category_ids: availableIds,
    impostor_hint: old.impostor_hint,
    impostor_count: old.impostor_count,
    impostors_know_each_other: old.impostors_know_each_other,
    impostor_mode: old.impostor_mode,
  }
  return createGame(
    activePlayers(old).map((p) => p.name),
    settings,
  )
}

// ---------------------------------------------------------------------------
// Players joining or leaving between rounds
// ---------------------------------------------------------------------------

const BETWEEN_ROUNDS = ['SETUP', 'ROUND_RESULTS'] as const

function fitImpostorCount(game: InternalGame): void {
  game.impostor_count = Math.min(game.impostor_count, maxImpostors(activePlayers(game).length))
}

/** A late arrival joins (score 0) for the next round. Re-adding someone who left
 * brings them back with their previous score. */
export async function addPlayer(gameId: number, name: string): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, BETWEEN_ROUNDS, 'add a player')
  const [cleaned] = validatePlayerNames([name], 1)
  if (activePlayers(game).length >= MAX_PLAYERS) {
    throw new GameValidationError(`A game can have at most ${MAX_PLAYERS} players.`)
  }
  const existing = game.players.find((p) => p.name.toLowerCase() === cleaned.toLowerCase())
  if (existing?.active) throw new GameValidationError(`${existing.name} is already playing.`)
  if (existing) {
    existing.active = true
  } else {
    const nextIndex = game.players.length ? Math.max(...game.players.map((p) => p.order_index)) + 1 : 0
    game.players.push({ id: game.next_player_id++, name: cleaned, order_index: nextIndex, score: 0, active: true })
  }
  saveGame(game)
  return toGameRead(game)
}

/** A player leaves: they sit out future rounds but keep their history and score. */
export async function removePlayer(gameId: number, playerId: number): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, BETWEEN_ROUNDS, 'remove a player')
  const player = findPlayer(game, playerId)
  if (activePlayers(game).length <= MIN_PLAYERS) {
    throw new GameValidationError(`A game needs at least ${MIN_PLAYERS} players.`)
  }
  player.active = false
  fitImpostorCount(game)
  saveGame(game)
  return toGameRead(game)
}

// ---------------------------------------------------------------------------
// Round generation
// ---------------------------------------------------------------------------

function wordCandidatesFor(bank: BankCategory[], game: InternalGame): WordCandidate[] {
  const categoryIds = new Set(game.categories.map((c) => c.id))
  const categories = game.category_mode === 'specific' ? bank.filter((c) => categoryIds.has(c.id)) : bank
  return categories.flatMap((c) =>
    c.words.map((w) => ({
      id: w.id,
      word: w.word,
      category_id: c.id,
      category_name: c.name,
      similar_word: w.similar_word,
    })),
  )
}

async function generateRound(game: InternalGame): Promise<void> {
  const previous = game.rounds[game.rounds.length - 1] ?? null
  const usedWordIds = new Set(
    game.rounds.map((r) => r.word_id).filter((id): id is number => id !== null),
  )
  const bank = await loadWordBank()
  const candidates = wordCandidatesFor(bank, game)
  const word = selectWord(candidates, usedWordIds)
  const impostorWord = game.impostor_mode === 'similar_word' ? chooseImpostorWord(word, candidates) : null

  const orderedIds = activePlayers(game).map((p) => p.id)
  const previousImpostorIds = previous ? previous.impostors.map((i) => i.player_id) : []
  const impostorIds = chooseImpostors(orderedIds, game.impostor_count, previousImpostorIds)
  const startingId = chooseStartingPlayer(orderedIds)

  game.state = transition(game.state, 'ROLE_REVEAL')
  game.current_round_number += 1
  game.rounds.push({
    round_number: game.current_round_number,
    category_name: word.category_name,
    word_id: word.id,
    secret_word: word.word,
    impostor_word: impostorWord,
    starting_player_id: startingId,
    reveal_index: 0,
    suspect_ids: [],
    impostors: impostorIds.map((playerId) => ({ player_id: playerId, guessed_word: null })),
    word_revealed: false,
    outcome: null,
    points: null,
    completed_at: null,
  })
}

// ---------------------------------------------------------------------------
// Role reveal
// ---------------------------------------------------------------------------

function requireRevealer(game: InternalGame, playerId: number): InternalRound {
  requireState(game.state, ['ROLE_REVEAL'], 'view a role')
  const round = currentRound(game)
  findPlayer(game, playerId)
  if (activePlayers(game)[round.reveal_index].id !== playerId) {
    throw new RoleAccessError("It is not this player's turn to view their role.")
  }
  return round
}

export async function getPlayerRole(gameId: number, playerId: number): Promise<PlayerRole> {
  const game = loadGame(gameId)
  const round = requireRevealer(game, playerId)
  const isImpostor = round.impostors.some((i) => i.player_id === playerId)
  const similarMode = game.impostor_mode === 'similar_word'
  let fellows: string[] | undefined
  if (isImpostor && !similarMode && game.impostors_know_each_other) {
    const names = game.players
      .filter((p) => p.id !== playerId && round.impostors.some((i) => i.player_id === p.id))
      .map((p) => p.name)
    fellows = names.length ? names : undefined
  }
  return buildRoleView({
    isImpostor,
    secretWord: round.secret_word,
    category: round.category_name,
    impostorHint: game.impostor_hint,
    fellowImpostors: fellows,
    impostorWord: similarMode ? round.impostor_word : null,
  }) as PlayerRole
}

export async function completeReveal(gameId: number, playerId: number): Promise<Game> {
  const game = loadGame(gameId)
  const round = requireRevealer(game, playerId)
  round.reveal_index += 1
  if (round.reveal_index === activePlayers(game).length) {
    game.state = transition(game.state, 'READY')
  }
  saveGame(game)
  return toGameRead(game)
}

// ---------------------------------------------------------------------------
// Clues, voting and reveal
// ---------------------------------------------------------------------------

export async function startClueRound(gameId: number): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, ['READY'], 'start the clue round')
  game.state = transition(game.state, 'CLUE_ROUND')
  saveGame(game)
  return toGameRead(game)
}

export async function startVoting(gameId: number): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, ['CLUE_ROUND'], 'start voting')
  game.state = transition(game.state, 'VOTING')
  saveGame(game)
  return toGameRead(game)
}

export async function selectSuspects(gameId: number, playerIds: number[]): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, ['VOTING'], 'select suspects')
  if (new Set(playerIds).size !== playerIds.length) {
    throw new GameValidationError('Each suspect can only be chosen once.')
  }
  if (playerIds.length !== game.impostor_count) {
    throw new GameValidationError(
      `Choose exactly ${game.impostor_count} suspect${game.impostor_count > 1 ? 's' : ''}, one per Impostor.`,
    )
  }
  for (const pid of playerIds) findPlayer(game, pid)
  currentRound(game).suspect_ids = playerIds
  game.state = transition(game.state, 'IMPOSTOR_REVEAL')
  saveGame(game)
  return toGameRead(game)
}

function impostorResults(round: InternalRound): Record<number, ImpostorResult> {
  const results: Record<number, ImpostorResult> = {}
  for (const impostor of round.impostors) {
    results[impostor.player_id] = impostorResult(
      round.suspect_ids.includes(impostor.player_id),
      impostor.guessed_word,
    )
  }
  return results
}

function finishRound(game: InternalGame, round: InternalRound): void {
  const results = impostorResults(round)
  const participants = activePlayers(game)
  const points = roundPoints(participants.map((p) => p.id), results)
  for (const player of participants) player.score += points[player.id]
  // Saved so this round's result stays fixed even if players join or leave later.
  round.points = points
  round.outcome = roundOutcome(results)
  round.completed_at = new Date().toISOString()
  game.state = transition(game.state, 'ROUND_RESULTS')
}

/** Reveal who the Impostors were. Caught Impostors get a final guess; else score now. */
export async function revealImpostors(gameId: number): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, ['IMPOSTOR_REVEAL'], 'reveal the Impostors')
  const round = currentRound(game)
  const anyCaught = round.impostors.some((i) => round.suspect_ids.includes(i.player_id))
  if (anyCaught) game.state = transition(game.state, 'FINAL_GUESS')
  else finishRound(game, round)
  saveGame(game)
  return toGameRead(game)
}

export async function revealWord(gameId: number): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, ['FINAL_GUESS'], 'reveal the word')
  currentRound(game).word_revealed = true
  saveGame(game)
  return toGameRead(game)
}

/** `correctPlayerIds`: caught Impostors whose spoken guess was right. */
export async function recordFinalGuess(gameId: number, correctPlayerIds: number[]): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, ['FINAL_GUESS'], 'record the final guess')
  const round = currentRound(game)
  if (!round.word_revealed) {
    throw new InvalidStateError('Reveal the word before recording the final guess.')
  }
  const caught = round.impostors.filter((i) => round.suspect_ids.includes(i.player_id))
  const caughtIds = new Set(caught.map((i) => i.player_id))
  if (!correctPlayerIds.every((id) => caughtIds.has(id))) {
    throw new GameValidationError('Only caught Impostors can make a final guess.')
  }
  const correctSet = new Set(correctPlayerIds)
  for (const impostor of caught) impostor.guessed_word = correctSet.has(impostor.player_id)
  finishRound(game, round)
  saveGame(game)
  return toGameRead(game)
}

// ---------------------------------------------------------------------------
// Round / game progression
// ---------------------------------------------------------------------------

export async function nextRound(gameId: number): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, ['ROUND_RESULTS'], 'start the next round')
  if (!hasMoreRounds(game.current_round_number, game.total_rounds)) {
    throw new InvalidStateError('All rounds have been played. Finish the game instead.')
  }
  await generateRound(game)
  saveGame(game)
  return toGameRead(game)
}

export async function finishGame(gameId: number): Promise<Game> {
  const game = loadGame(gameId)
  requireState(game.state, ['ROUND_RESULTS'], 'finish the game')
  if (hasMoreRounds(game.current_round_number, game.total_rounds)) {
    throw new InvalidStateError('There are still rounds left to play.')
  }
  game.state = transition(game.state, 'GAME_RESULTS')
  game.finished_at = new Date().toISOString()
  saveGame(game)
  return toGameRead(game)
}

// ---------------------------------------------------------------------------
// Public views (never include secrets the current state doesn't allow)
// ---------------------------------------------------------------------------

function inPlayerOrder(game: InternalGame, ids: readonly number[]): number[] {
  return game.players.filter((p) => ids.includes(p.id)).map((p) => p.id)
}

function roundRead(game: InternalGame, round: InternalRound): Game['round'] {
  const players = activePlayers(game)
  const view: NonNullable<Game['round']> = {
    round_number: round.round_number,
    starting_player_id: round.starting_player_id,
    revealer_id: null,
    next_revealer_id: null,
    revealed_count: round.reveal_index,
    suspect_ids: inPlayerOrder(game, round.suspect_ids),
    impostor_ids: null,
    caught_impostor_ids: null,
    word_revealed: round.word_revealed,
    secret_word: null,
    impostor_word: null,
    category: null,
    guessed_word_ids: null,
    outcome: null,
    points: null,
    explanation: null,
  }
  if (game.state === 'ROLE_REVEAL') {
    view.revealer_id = players[round.reveal_index].id
    if (round.reveal_index + 1 < players.length) view.next_revealer_id = players[round.reveal_index + 1].id
  }
  if (isImpostorVisible(game.state)) {
    const impostorIds = round.impostors.map((i) => i.player_id)
    view.impostor_ids = inPlayerOrder(game, impostorIds)
    view.caught_impostor_ids = view.impostor_ids.filter((pid) => round.suspect_ids.includes(pid))
  }
  if (isWordVisible(game.state, round.word_revealed)) {
    view.secret_word = round.secret_word
    view.impostor_word = round.impostor_word
    view.category = round.category_name
  }
  if (round.outcome !== null) {
    const results = impostorResults(round)
    const names = Object.fromEntries(game.players.map((p) => [p.id, p.name]))
    view.guessed_word_ids = inPlayerOrder(
      game,
      Object.entries(results)
        .filter(([, r]) => r === 'caught_guessed')
        .map(([id]) => Number(id)),
    )
    view.outcome = round.outcome
    view.points = round.points
    view.explanation = explainRound(results, names)
  }
  return view
}

export function toGameRead(game: InternalGame): Game {
  return {
    id: game.id,
    state: game.state,
    total_rounds: game.total_rounds,
    current_round_number: game.current_round_number,
    settings: {
      total_rounds: game.total_rounds,
      category_mode: game.category_mode,
      category_ids: game.categories.map((c) => c.id),
      categories: game.categories,
      impostor_hint: game.impostor_hint,
      impostor_count: game.impostor_count,
      impostors_know_each_other: game.impostors_know_each_other,
      impostor_mode: game.impostor_mode,
    },
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      order_index: p.order_index,
      score: p.score,
      active: p.active,
    })),
    round: game.rounds.length ? roundRead(game, game.rounds[game.rounds.length - 1]) : null,
  }
}

export async function getGame(gameId: number): Promise<Game> {
  return toGameRead(loadGame(gameId))
}

export async function getResults(gameId: number): Promise<GameResults> {
  const game = loadGame(gameId)
  const names = Object.fromEntries(game.players.map((p) => [p.id, p.name]))
  const standings = rankPlayers(
    game.players.map((p) => ({ id: p.id, name: p.name, score: p.score, order_index: p.order_index })),
  )
  const rounds: RoundSummary[] = game.rounds
    .filter((r) => r.outcome !== null)
    .map((r) => {
      const results = impostorResults(r)
      const impostorIds = inPlayerOrder(game, r.impostors.map((i) => i.player_id))
      return {
        round_number: r.round_number,
        category: r.category_name,
        secret_word: r.secret_word,
        impostor_word: r.impostor_word,
        impostor_ids: impostorIds,
        impostor_names: impostorIds.map((id) => names[id]),
        suspect_ids: inPlayerOrder(game, r.suspect_ids),
        outcome: r.outcome as RoundOutcome,
        explanation: explainRound(results, names),
      }
    })
  return { game_id: game.id, state: game.state, standings, rounds }
}
