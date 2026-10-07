import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { ErrorMessage } from '../components/ErrorMessage'
import { CategoryPicker } from '../components/CategoryPicker'
import { OptionGroup } from '../components/OptionGroup'
import { RoundsInput } from '../components/RoundsInput'
import { Screen } from '../components/Screen'
import { useAction } from '../hooks/useAction'
import { useAdmin } from '../hooks/useAdmin'
import { gameApi, libraryApi } from '../services/api'
import { useSetup } from '../stores/setupContext'
import type { Category } from '../types/api'
import { rememberGame } from '../utils/history'
import { MIN_PLAYERS, maxImpostors, plural } from '../utils/players'
import { BackHeader } from './PlayerSetupPage'

export function GameSettingsPage() {
  const navigate = useNavigate()
  const { players, settings, setSettings, setActiveGameId } = useSetup()
  // null while loading
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [roundsValid, setRoundsValid] = useState(true)
  const { run, pending, error, setError } = useAction()
  const admin = useAdmin()

  useEffect(() => {
    libraryApi
      .listCategories(false)
      .then((all) => setCategories(all.filter((c) => c.word_count > 0)))
      .catch((err: Error) => setError(err.message))
  }, [setError])

  if (players.length < MIN_PLAYERS) return <Navigate to="/setup" replace />

  // Ignore saved selections that are no longer available (disabled, deleted or empty).
  const available = new Set((categories ?? []).map((c) => c.id))
  const selectedIds = settings.category_ids.filter((id) => available.has(id))
  const isRandom = settings.category_mode === 'random' || selectedIds.length === 0

  const chooseRandom = () => setSettings({ ...settings, category_mode: 'random', category_ids: [] })
  const toggleCategory = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((c) => c !== id)
      : [...selectedIds, id]
    setSettings({
      ...settings,
      category_mode: next.length ? 'specific' : 'random',
      category_ids: next,
    })
  }

  const impostorLimit = maxImpostors(players.length)
  const impostorCount = Math.min(settings.impostor_count, impostorLimit)
  const similarMode = settings.impostor_mode === 'similar_word'

  const startGame = () =>
    run(async () => {
      const created = await gameApi.create(
        players.map((p) => p.name),
        {
          ...settings,
          category_mode: isRandom ? 'random' : 'specific',
          category_ids: isRandom ? [] : selectedIds,
          impostor_count: impostorCount,
          impostors_know_each_other:
            impostorCount > 1 && !similarMode && settings.impostors_know_each_other,
        },
      )
      await gameApi.start(created.id)
      setActiveGameId(created.id)
      rememberGame(created.id)
      navigate(`/game/${created.id}`)
    })

  return (
    <Screen
      header={<BackHeader onBack={() => navigate('/setup')} />}
      actions={
        <>
          <ErrorMessage error={error} />
          <Button onClick={startGame} loading={pending} disabled={!roundsValid || categories === null}>
            Start game
          </Button>
        </>
      }
    >
      <h1 className="font-display text-4xl">Settings</h1>

      <RoundsInput
        value={settings.total_rounds}
        onChange={(rounds) => {
          setRoundsValid(rounds !== null)
          if (rounds !== null) setSettings({ ...settings, total_rounds: rounds })
        }}
      />

      <CategoryPicker
        categories={categories}
        isRandom={isRandom}
        showCounts={admin.canEdit}
        selectedIds={selectedIds}
        onRandom={chooseRandom}
        onToggle={toggleCategory}
      />

      <OptionGroup
        label="Impostors"
        value={impostorCount}
        onChange={(impostor_count) => setSettings({ ...settings, impostor_count })}
        columns={Math.min(impostorLimit, 4)}
        options={Array.from({ length: impostorLimit }, (_, i) => ({
          value: i + 1,
          label: String(i + 1),
        }))}
      />
      {impostorLimit === 1 && (
        <p className="-mt-4 text-sm font-bold text-muted">Add 5+ players to play with 2 Impostors.</p>
      )}

      <OptionGroup
        label="Impostor mode"
        value={settings.impostor_mode}
        onChange={(impostor_mode) => setSettings({ ...settings, impostor_mode })}
        options={[
          { value: 'classic', label: 'Classic', hint: 'Impostors get no word' },
          { value: 'similar_word', label: 'Similar word', hint: "They get a close word and don't know" },
        ]}
      />
      {similarMode && (
        <p className="-mt-4 text-sm font-bold text-muted">
          Impostors see a related word (Penguin → Puffin) and aren&apos;t told they&apos;re the Impostor.
        </p>
      )}

      <OptionGroup
        label="Impostors know each other?"
        disabled={impostorCount < 2 || similarMode}
        value={impostorCount > 1 && !similarMode && settings.impostors_know_each_other ? 'yes' : 'no'}
        onChange={(v) => setSettings({ ...settings, impostors_know_each_other: v === 'yes' })}
        options={[
          { value: 'no', label: 'No', hint: 'Each works alone' },
          { value: 'yes', label: 'Yes', hint: 'They see their team' },
        ]}
      />
      {(impostorCount < 2 || similarMode) && (
        <p className="-mt-4 text-sm font-bold text-muted">
          {similarMode
            ? "Not used in Similar word mode: Impostors don't know they're Impostors."
            : 'Choose 2 or more Impostors to turn this on.'}
        </p>
      )}

      <OptionGroup
        label="Impostor hint"
        disabled={similarMode}
        value={settings.impostor_hint}
        onChange={(impostor_hint) => setSettings({ ...settings, impostor_hint })}
        options={[
          { value: 'category', label: 'Show category', hint: 'Easier' },
          { value: 'none', label: 'No hint', hint: 'Harder' },
        ]}
      />

      <p className="text-sm font-bold text-muted">
        {players.length} players · {plural(impostorCount, 'Impostor')}
      </p>
    </Screen>
  )
}
