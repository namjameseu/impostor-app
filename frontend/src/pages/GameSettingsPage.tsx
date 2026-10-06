import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { ErrorMessage } from '../components/ErrorMessage'
import { OptionButton, OptionGroup } from '../components/OptionGroup'
import { RoundsInput } from '../components/RoundsInput'
import { Screen } from '../components/Screen'
import { Loading } from '../components/Spinner'
import { useAction } from '../hooks/useAction'
import { gameApi, libraryApi } from '../services/api'
import { useSetup } from '../stores/setupContext'
import type { Category } from '../types/api'
import { MIN_PLAYERS } from '../utils/players'
import { BackHeader } from './PlayerSetupPage'

export function GameSettingsPage() {
  const navigate = useNavigate()
  const { players, settings, setSettings, setActiveGameId } = useSetup()
  // null while loading
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [roundsValid, setRoundsValid] = useState(true)
  const { run, pending, error, setError } = useAction()

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

  const startGame = () =>
    run(async () => {
      const created = await gameApi.create(
        players.map((p) => p.name),
        {
          ...settings,
          category_mode: isRandom ? 'random' : 'specific',
          category_ids: isRandom ? [] : selectedIds,
        },
      )
      await gameApi.start(created.id)
      setActiveGameId(created.id)
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

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-extrabold tracking-widest text-muted uppercase">
          Categories
        </legend>
        <p className="-mt-1 mb-1 text-sm font-bold text-muted">
          {isRandom
            ? 'Random uses every category. Pick one or more to mix your own.'
            : `Mixing ${selectedIds.length} ${selectedIds.length === 1 ? 'category' : 'categories'}.`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <OptionButton selected={isRandom} label="🎲 Random" hint="All categories" onClick={chooseRandom} />
          {categories === null && <Loading label="Loading categories…" className="col-span-2 py-6" />}
          {categories?.map((c) => (
            <OptionButton
              key={c.id}
              selected={!isRandom && selectedIds.includes(c.id)}
              label={`${!isRandom && selectedIds.includes(c.id) ? '✓ ' : ''}${c.name}`}
              hint={`${c.word_count} words`}
              onClick={() => toggleCategory(c.id)}
            />
          ))}
        </div>
      </fieldset>

      <OptionGroup
        label="Impostor hint"
        value={settings.impostor_hint}
        onChange={(impostor_hint) => setSettings({ ...settings, impostor_hint })}
        options={[
          { value: 'category', label: 'Show category', hint: 'Easier' },
          { value: 'none', label: 'No hint', hint: 'Harder' },
        ]}
      />

      <p className="text-sm font-bold text-muted">
        {players.length} players · 1 Impostor
      </p>
    </Screen>
  )
}
