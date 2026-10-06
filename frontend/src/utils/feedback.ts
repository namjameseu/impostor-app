import { loadJson, saveJson } from './storage'

// Sound effects (synthesised with Web Audio, no files) and vibration for the big moments.
// Private role screens only ever use the same neutral buzz for everyone, so sound or
// vibration can never reveal who the Impostor is.

const KEY = 'impostor.sound'
let enabled = loadJson<boolean>(KEY, true)
let audio: AudioContext | null = null

export const soundEnabled = () => enabled

export function setSoundEnabled(on: boolean): void {
  enabled = on
  saveJson(KEY, on)
}

export function vibrate(pattern: number | number[]): void {
  if (!enabled) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // unsupported (e.g. iOS) - fine
  }
}

type Note = [frequency: number, start: number, duration: number, type?: OscillatorType]

function play(notes: Note[], volume = 0.18): void {
  if (!enabled) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    const now = audio.currentTime
    for (const [frequency, start, duration, type = 'triangle'] of notes) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = type
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)
      osc.connect(gain).connect(audio.destination)
      osc.start(now + start)
      osc.stop(now + start + duration + 0.05)
    }
  } catch {
    // no audio available - fine
  }
}

export const feedback = {
  /** Same for every player when their role appears. */
  roleShown: () => vibrate(35),
  tap: () => play([[660, 0, 0.06, 'sine']], 0.08),
  drumroll: () => {
    play(Array.from({ length: 10 }, (_, i): Note => [110 + i * 6, i * 0.07, 0.06, 'square']), 0.06)
    vibrate([30, 40, 30, 40, 30, 40, 30])
  },
  /** An Impostor was caught. */
  caught: () => {
    play([
      [523, 0, 0.15],
      [659, 0.15, 0.15],
      [784, 0.3, 0.35],
    ])
    vibrate([150, 80, 300])
  },
  /** The Impostors got away. */
  escaped: () => {
    play([
      [392, 0, 0.2, 'sawtooth'],
      [311, 0.22, 0.2, 'sawtooth'],
      [233, 0.44, 0.5, 'sawtooth'],
    ], 0.1)
    vibrate([400])
  },
  wordRevealed: () => {
    play([
      [880, 0, 0.12, 'sine'],
      [1175, 0.1, 0.25, 'sine'],
    ], 0.12)
    vibrate(60)
  },
  fanfare: () => {
    play([
      [523, 0, 0.15],
      [523, 0.16, 0.15],
      [523, 0.32, 0.15],
      [698, 0.5, 0.5],
      [880, 0.55, 0.45],
    ])
    vibrate([100, 60, 100, 60, 300])
  },
}
