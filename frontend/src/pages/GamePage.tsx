import type { ComponentType } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { ErrorMessage } from '../components/ErrorMessage'
import { GameHeader } from '../components/GameHeader'
import { Screen } from '../components/Screen'
import { Loading } from '../components/Spinner'
import { ScreenHeaderContext } from '../components/screenHeader'
import { useGame } from '../hooks/useGame'
import type { GameState } from '../types/api'
import { ClueRoundScreen } from './game/ClueRoundScreen'
import { FinalGuessScreen } from './game/FinalGuessScreen'
import { GameResultsScreen } from './game/GameResultsScreen'
import { ImpostorRevealScreen } from './game/ImpostorRevealScreen'
import { LobbyScreen } from './game/LobbyScreen'
import { ReadyScreen } from './game/ReadyScreen'
import { RoleRevealScreen } from './game/RoleRevealScreen'
import { RoundResultsScreen } from './game/RoundResultsScreen'
import type { ScreenProps } from './game/types'
import { VotingScreen } from './game/VotingScreen'

const SCREENS: Record<GameState, ComponentType<ScreenProps>> = {
  SETUP: LobbyScreen,
  ROLE_REVEAL: RoleRevealScreen,
  READY: ReadyScreen,
  CLUE_ROUND: ClueRoundScreen,
  VOTING: VotingScreen,
  IMPOSTOR_REVEAL: ImpostorRevealScreen,
  FINAL_GUESS: FinalGuessScreen,
  ROUND_RESULTS: RoundResultsScreen,
  GAME_RESULTS: GameResultsScreen,
}

export function GamePage() {
  const gameId = Number(useParams().gameId)
  const { game, setGame, error, reload } = useGame(gameId)

  if (!game) {
    return (
      <Screen center actions={error && <Button onClick={reload}>Try again</Button>}>
        {error ? <ErrorMessage error={error} /> : <Loading label="Loading game…" />}
      </Screen>
    )
  }

  const StateScreen = SCREENS[game.state]
  // Keys force a fresh screen (and wipe any private local state) on every turn/round change.
  const key = `${game.state}-${game.current_round_number}-${game.round?.revealer_id ?? ''}`

  return (
    <ScreenHeaderContext.Provider value={<GameHeader game={game} />}>
      <StateScreen key={key} game={game} onUpdate={setGame} />
    </ScreenHeaderContext.Provider>
  )
}
