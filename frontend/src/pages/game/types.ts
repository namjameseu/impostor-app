import type { Game } from '../../types/api'

export interface ScreenProps {
  game: Game
  onUpdate: (game: Game) => void
}
