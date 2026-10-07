import { loadJson, saveJson } from './storage'

const THEME_KEY = 'impostor.theme'

/** Colour themes. The palettes themselves live in index.css under [data-theme]. */
export const THEMES = [
  { id: 'purple', name: 'Purple', accent: '#a78bfa', ink: '#0c0a1d' },
  { id: 'ocean', name: 'Ocean', accent: '#60a5fa', ink: '#07121f' },
  { id: 'forest', name: 'Forest', accent: '#4ade80', ink: '#08140f' },
  { id: 'sunset', name: 'Sunset', accent: '#fb923c', ink: '#170c09' },
  { id: 'midnight', name: 'Midnight', accent: '#cbd5e1', ink: '#0b0d12' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export function loadTheme(): ThemeId {
  const saved = loadJson<string>(THEME_KEY, 'purple')
  return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : 'purple'
}

/** Switch the page's colours (and the phone's status bar colour) and remember the choice. */
export function applyTheme(id: ThemeId, save = true): void {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0]
  document.documentElement.dataset.theme = theme.id
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.ink)
  if (save) saveJson(THEME_KEY, theme.id)
}
