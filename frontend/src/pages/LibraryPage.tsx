import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { ErrorMessage } from '../components/ErrorMessage'
import { Modal, inputClass } from '../components/Modal'
import { OptionGroup } from '../components/OptionGroup'
import { Screen } from '../components/Screen'
import { Loading, Spinner } from '../components/Spinner'
import { useAction } from '../hooks/useAction'
import { useAdmin } from '../hooks/useAdmin'
import { libraryApi } from '../services/api'
import type { Category, Difficulty, Word } from '../types/api'
import { BackHeader } from './PlayerSetupPage'

type Tab = 'words' | 'categories'

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  easy: 'bg-emerald-400/15 text-emerald-300',
  medium: 'bg-amber-400/15 text-amber-300',
  hard: 'bg-rose-400/15 text-rose-300',
}

const selectClass =
  'min-h-12 w-full rounded-xl border-2 border-line bg-panel px-3 font-bold text-white focus:border-accent focus:outline-none'

export function LibraryPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('words')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const { run, error } = useAction()
  const admin = useAdmin()

  const loadCategories = useCallback(
    () =>
      run(async () => {
        setCategories(await libraryApi.listCategories())
        setCategoriesLoaded(true)
      }),
    [run],
  )
  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  return (
    <Screen header={<BackHeader onBack={() => navigate('/')} title="Word library" />}>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-panel p-1">
        {(['words', 'categories'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 rounded-xl font-display text-sm uppercase ${
              tab === t ? 'bg-accent text-ink' : 'text-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {admin.passcodeRequired && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
          <span className="text-2xl" aria-hidden="true">{admin.unlocked ? '🔓' : '🔒'}</span>
          <p className="flex-1 text-sm font-bold text-muted">
            {admin.unlocked ? 'Editing unlocked on this device.' : 'Editing the library needs the admin passcode.'}
          </p>
          {admin.unlocked ? (
            <button type="button" onClick={admin.lock} className="min-h-10 rounded-lg bg-panel-2 px-3 text-xs font-extrabold text-muted hover:text-white">
              Lock
            </button>
          ) : (
            <button type="button" onClick={() => setUnlocking(true)} className="min-h-10 rounded-lg bg-accent px-3 font-display text-xs text-ink uppercase">
              Unlock
            </button>
          )}
        </div>
      )}
      <ErrorMessage error={error} />
      {tab === 'words' ? (
        <WordsTab categories={categories} canEdit={admin.canEdit} onChanged={loadCategories} />
      ) : (
        <CategoriesTab
          categories={categories}
          loaded={categoriesLoaded}
          canEdit={admin.canEdit}
          onChanged={loadCategories}
        />
      )}
      {unlocking && <UnlockForm onUnlock={admin.unlock} onClose={() => setUnlocking(false)} />}
    </Screen>
  )
}

// --- Words --------------------------------------------------------------------

function WordsTab({
  categories,
  canEdit,
  onChanged,
}: {
  categories: Category[]
  canEdit: boolean
  onChanged: () => void
}) {
  const [words, setWords] = useState<Word[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [editing, setEditing] = useState<Word | 'new' | null>(null)
  const [loaded, setLoaded] = useState(false)
  const { run, pending, error } = useAction()

  const load = useCallback(
    () =>
      run(async () => {
        setWords(
          await libraryApi.listWords({
            search: search.trim() || undefined,
            category_id: categoryId || undefined,
            difficulty: difficulty || undefined,
          }),
        )
        setLoaded(true)
      }),
    [run, search, categoryId, difficulty],
  )

  useEffect(() => {
    const timer = setTimeout(load, 200)
    return () => clearTimeout(timer)
  }, [load])

  const refresh = () => {
    load()
    onChanged()
  }

  const toggle = (word: Word) =>
    run(async () => {
      await libraryApi.updateWord(word.id, { enabled: !word.enabled })
      refresh()
    })

  const remove = (word: Word) => {
    if (!window.confirm(`Delete "${word.word}"? Disabling keeps it for later.`)) return
    run(async () => {
      await libraryApi.deleteWord(word.id)
      refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search words…"
        aria-label="Search words"
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
          aria-label="Filter by category"
          className={selectClass}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
          aria-label="Filter by difficulty"
          className={selectClass}
        >
          <option value="">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <Button size="md" onClick={() => setEditing('new')} disabled={!canEdit || categories.length === 0}>
        + Add word
      </Button>
      <ErrorMessage error={error} />

      {loaded ? (
        <p className="flex items-center gap-2 text-sm font-bold text-muted">
          {words.length} words
          {pending && <Spinner size="sm" className="text-accent" />}
        </p>
      ) : (
        <Loading label="Loading words…" />
      )}
      <ul className="flex flex-col gap-2">
        {words.map((word) => (
          <li
            key={word.id}
            className={`flex items-center gap-3 rounded-xl bg-panel px-4 py-3 ${word.enabled ? '' : 'opacity-50'}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-extrabold">{word.word}</p>
              <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
                {word.category_name}
                <span className={`rounded-full px-2 py-0.5 capitalize ${DIFFICULTY_STYLES[word.difficulty]}`}>
                  {word.difficulty}
                </span>
                {!word.enabled && <span>Disabled</span>}
              </p>
            </div>
            <RowActions
              disabled={!canEdit}
              enabled={word.enabled}
              onToggle={() => toggle(word)}
              onEdit={() => setEditing(word)}
              onDelete={() => remove(word)}
            />
          </li>
        ))}
      </ul>

      {editing && (
        <WordForm
          word={editing === 'new' ? null : editing}
          categories={categories}
          defaultCategoryId={categoryId || categories[0]?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function WordForm({
  word,
  categories,
  defaultCategoryId,
  onClose,
  onSaved,
}: {
  word: Word | null
  categories: Category[]
  defaultCategoryId?: number
  onClose: () => void
  onSaved: () => void
}) {
  const [text, setText] = useState(word?.word ?? '')
  const [categoryId, setCategoryId] = useState(word?.category_id ?? defaultCategoryId ?? 0)
  const [difficulty, setDifficulty] = useState<Difficulty>(word?.difficulty ?? 'medium')
  const { run, pending, error } = useAction()

  const save = (e: FormEvent) => {
    e.preventDefault()
    const data = { word: text.trim(), category_id: categoryId, difficulty }
    run(async () => {
      if (word) await libraryApi.updateWord(word.id, data)
      else await libraryApi.createWord(data)
      onSaved()
    })
  }

  return (
    <Modal title={word ? 'Edit word' : 'Add word'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Word"
          maxLength={80}
          autoFocus
          aria-label="Word"
          className={inputClass}
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(Number(e.target.value))}
          aria-label="Category"
          className={selectClass}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.enabled ? '' : ' (disabled)'}
            </option>
          ))}
        </select>
        <OptionGroup
          label="Difficulty"
          value={difficulty}
          onChange={setDifficulty}
          options={[
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
        />
        <ErrorMessage error={error} />
        <Button type="submit" size="md" loading={pending} disabled={!text.trim() || !categoryId}>
          Save
        </Button>
      </form>
    </Modal>
  )
}

// --- Categories ------------------------------------------------------------------

function CategoriesTab({
  categories,
  loaded,
  canEdit,
  onChanged,
}: {
  categories: Category[]
  loaded: boolean
  canEdit: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const { run, error } = useAction()

  const toggle = (category: Category) =>
    run(async () => {
      await libraryApi.updateCategory(category.id, { enabled: !category.enabled })
      onChanged()
    })

  return (
    <div className="flex flex-col gap-4">
      <Button size="md" onClick={() => setEditing('new')} disabled={!canEdit}>
        + Add category
      </Button>
      <ErrorMessage error={error} />
      {!loaded && <Loading label="Loading categories…" />}
      <ul className="flex flex-col gap-2">
        {categories.map((category) => (
          <li
            key={category.id}
            className={`flex items-center gap-3 rounded-xl bg-panel px-4 py-3 ${category.enabled ? '' : 'opacity-50'}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-extrabold">{category.name}</p>
              <p className="truncate text-xs font-bold text-muted">
                {category.word_count} active words
                {category.description ? ` · ${category.description}` : ''}
                {category.enabled ? '' : ' · Disabled'}
              </p>
            </div>
            <RowActions
              disabled={!canEdit}
              enabled={category.enabled}
              onToggle={() => toggle(category)}
              onEdit={() => setEditing(category)}
            />
          </li>
        ))}
      </ul>

      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function CategoryForm({
  category,
  onClose,
  onSaved,
}: {
  category: Category | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const { run, pending, error } = useAction()

  const save = (e: FormEvent) => {
    e.preventDefault()
    const data = { name: name.trim(), description: description.trim() || null }
    run(async () => {
      if (category) await libraryApi.updateCategory(category.id, data)
      else await libraryApi.createCategory(data)
      onSaved()
    })
  }

  return (
    <Modal title={category ? 'Edit category' : 'Add category'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          maxLength={50}
          autoFocus
          aria-label="Category name"
          className={inputClass}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          maxLength={255}
          aria-label="Category description"
          className={inputClass}
        />
        <ErrorMessage error={error} />
        <Button type="submit" size="md" loading={pending} disabled={!name.trim()}>
          Save
        </Button>
      </form>
    </Modal>
  )
}

// --- Shared ---------------------------------------------------------------------

function UnlockForm({
  onUnlock,
  onClose,
}: {
  onUnlock: (passcode: string) => Promise<void>
  onClose: () => void
}) {
  const [passcode, setPasscode] = useState('')
  const { run, pending, error } = useAction()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      await onUnlock(passcode)
      onClose()
    })
  }

  return (
    <Modal title="Unlock editing" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Admin passcode"
          autoFocus
          autoComplete="current-password"
          aria-label="Admin passcode"
          className={inputClass}
        />
        <ErrorMessage error={error} />
        <Button type="submit" size="md" loading={pending} disabled={!passcode}>
          Unlock
        </Button>
      </form>
    </Modal>
  )
}

function RowActions({
  enabled,
  disabled,
  onToggle,
  onEdit,
  onDelete,
}: {
  enabled: boolean
  disabled: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete?: () => void
}) {
  const base =
    'min-h-10 rounded-lg bg-panel-2 px-3 text-xs font-extrabold text-muted enabled:hover:text-white disabled:opacity-30'
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" onClick={onEdit} disabled={disabled} className={base}>
        Edit
      </button>
      <button type="button" onClick={onToggle} disabled={disabled} className={base}>
        {enabled ? 'Disable' : 'Enable'}
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} disabled={disabled} aria-label="Delete" className={`${base} enabled:hover:text-rose-300`}>
          ✕
        </button>
      )}
    </div>
  )
}
