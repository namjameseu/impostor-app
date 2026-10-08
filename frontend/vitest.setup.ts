import { beforeEach } from 'vitest'

/** Minimal localStorage/sessionStorage polyfill — Node has no Web Storage globals, and
 * pulling in jsdom just for this would be overkill for pure-logic unit tests. */
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear() {
    this.store.clear()
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
}

globalThis.localStorage = new MemoryStorage()
globalThis.sessionStorage = new MemoryStorage()

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
