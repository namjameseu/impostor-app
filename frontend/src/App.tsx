import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { GamePage } from './pages/GamePage'
import { GameSettingsPage } from './pages/GameSettingsPage'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { PlayerSetupPage } from './pages/PlayerSetupPage'
import { StatsPage } from './pages/StatsPage'
import { SetupProvider } from './stores/setupStore'

export default function App() {
  return (
    <SetupProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/setup" element={<PlayerSetupPage />} />
          <Route path="/settings" element={<GameSettingsPage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SetupProvider>
  )
}
