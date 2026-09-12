import { create } from 'zustand'
import {
  BPM_MAX,
  BPM_MIN,
  CELLS_PER_PATTERN,
  CHAR_SIZE_MAX,
  CHAR_SIZE_MIN,
  MOTION_LEVELS,
  PERSISTED_KEYS,
  REELS_MAX,
  REELS_MIN,
  SPIN_FIRST_STOP_MS,
  SPIN_SETTLE_MS,
  SPIN_STAGGER_MS,
  SPIN_TICK_MS,
  STORAGE_KEY,
  defaults,
} from './defaults.js'

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Saved data can be older or hand-edited; keep only shapes we understand. */
function reconcile(saved) {
  const base = defaults()
  if (!saved) return base
  const out = { ...base }
  const lines = (v, fallback) =>
    Array.isArray(v)
      ? v.filter((l) => l && typeof l.text === 'string').map((l) => ({ text: l.text, on: !!l.on }))
      : fallback
  const chords = (v, fallback) =>
    Array.isArray(v)
      ? v.filter((c) => c && typeof c.name === 'string').map((c) => ({ name: c.name, on: !!c.on }))
      : fallback

  if (saved.theme === 'dark' || saved.theme === 'light') out.theme = saved.theme
  if (Number.isFinite(saved.bpm)) out.bpm = clamp(Math.round(saved.bpm), BPM_MIN, BPM_MAX)
  if (Number.isFinite(saved.reelCount)) out.reelCount = clamp(Math.round(saved.reelCount), REELS_MIN, REELS_MAX)
  if (typeof saved.sound === 'boolean') out.sound = saved.sound
  out.known = chords(saved.known, base.known)
  out.learn = chords(saved.learn, base.learn)
  if (Array.isArray(saved.patterns)) {
    const ok = saved.patterns
      .filter((p) => p && Array.isArray(p.cells) && p.cells.length === CELLS_PER_PATTERN)
      .map((p) => ({ cells: p.cells.map((c) => (c === 'D' || c === 'U' ? c : 'R')), on: !!p.on }))
    if (ok.length) out.patterns = ok
  }
  out.patternIdx = clamp(Number(saved.patternIdx) || 0, 0, out.patterns.length - 1)
  out.sayTaps = lines(saved.sayTaps, base.sayTaps)
  out.sayDrags = lines(saved.sayDrags, base.sayDrags)
  out.sayFalls = lines(saved.sayFalls, base.sayFalls)
  out.kokoPos = validPos(saved.kokoPos)
  out.pixPos = validPos(saved.pixPos)
  if (['video', 'pixel', 'both'].includes(saved.charMode)) out.charMode = saved.charMode
  if (Number.isFinite(saved.charSize)) out.charSize = clamp(Math.round(saved.charSize), CHAR_SIZE_MIN, CHAR_SIZE_MAX)
  if (MOTION_LEVELS.includes(saved.motion)) out.motion = saved.motion
  if (typeof saved.throwPhysics === 'boolean') out.throwPhysics = saved.throwPhysics
  return out
}

const validPos = (p) =>
  p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 8 && p.y > 8 ? { x: p.x, y: p.y } : null

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

let saveTimer = null
function persist(state) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const out = {}
    for (const k of PERSISTED_KEYS) out[k] = state[k]
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
    } catch {
      /* private mode / quota — the app still works, it just won't remember */
    }
  }, 250)
}

const EMPTY_POOL = [{ name: '–', tone: 'know' }]

/**
 * The chord pool: enabled "known" chords, then enabled "to learn" chords.
 *
 * The result is cached against the two source arrays so repeated calls return the
 * *same* array. This is used as a zustand selector, which compares by identity — a
 * fresh array every call would re-render every subscriber on every store change,
 * including the reel index ticking ten times a second through a spin. That in turn
 * re-rendered the scene's lighting and sent the environment probe back to re-bake.
 */
let poolCache = { known: null, learn: null, value: EMPTY_POOL }

export function poolOf(state) {
  if (poolCache.known === state.known && poolCache.learn === state.learn) return poolCache.value
  const out = []
  for (const c of state.known) if (c.on) out.push({ name: c.name, tone: 'know' })
  for (const c of state.learn) if (c.on) out.push({ name: c.name, tone: 'learn' })
  poolCache = { known: state.known, learn: state.learn, value: out.length ? out : EMPTY_POOL }
  return poolCache.value
}

const spinTimeouts = []
const spinIntervals = []
function clearSpinTimers() {
  while (spinTimeouts.length) clearTimeout(spinTimeouts.pop())
  while (spinIntervals.length) clearInterval(spinIntervals.pop())
}

export const useStore = create((set, get) => ({
  ...reconcile(loadSaved()),

  // --- session-only state -------------------------------------------------
  tab: 'home',
  unlocked: false,
  playing: false,
  beat: -1,
  popup: null,
  reelIdx: [0, 1, 2, 3, 4, 5],
  reelSpin: [false, false, false, false, false, false],
  reelSettle: [false, false, false, false, false, false],
  /** Increments once per spin; the 3D reels watch this to start their animation. */
  spinToken: 0,
  /** The results decided up-front, so the drums land exactly where the logic says. */
  spinResults: null,
  lever: 0,
  leverActive: false,
  ready3d: false,

  // --- helpers ------------------------------------------------------------
  pool: () => poolOf(get()),
  save: () => persist(get()),

  set: (patch) => {
    set(patch)
    persist(get())
  },

  // --- settings -----------------------------------------------------------
  setTab: (tab) => set({ tab }),
  setPopup: (popup) => set({ popup }),
  toggleTheme: () => {
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }))
    persist(get())
  },
  toggleLock: () => set((s) => ({ unlocked: !s.unlocked })),
  setBpm: (v) => {
    set({ bpm: clamp(Math.round(v) || BPM_MIN, BPM_MIN, BPM_MAX) })
    persist(get())
  },
  setReelCount: (v) => {
    set({ reelCount: clamp(Math.round(v), REELS_MIN, REELS_MAX) })
    persist(get())
  },
  setSound: (sound) => {
    set({ sound })
    persist(get())
  },
  setThrowPhysics: (throwPhysics) => {
    set({ throwPhysics })
    persist(get())
  },
  setCharMode: (charMode) => {
    set({ charMode })
    persist(get())
  },
  setMotion: (motion) => {
    set({ motion })
    persist(get())
  },
  setCharSize: (v) => {
    set({ charSize: clamp(Math.round(v), CHAR_SIZE_MIN, CHAR_SIZE_MAX) })
    persist(get())
  },

  // --- chord lists --------------------------------------------------------
  addChord: (listKey, name) => {
    const clean = name.trim()
    if (!clean) return
    const list = get()[listKey]
    if (list.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return
    set({ [listKey]: list.concat([{ name: clean, on: true }]) })
    persist(get())
  },
  toggleChord: (listKey, i) => {
    set((s) => ({ [listKey]: s[listKey].map((c, j) => (j === i ? { ...c, on: !c.on } : c)) }))
    persist(get())
  },
  removeChord: (listKey, i) => {
    set((s) => ({ [listKey]: s[listKey].filter((_, j) => j !== i) }))
    persist(get())
  },

  // --- patterns -----------------------------------------------------------
  addPattern: (cells) => {
    if (cells.every((c) => c === 'R')) return
    set((s) => ({ patterns: s.patterns.concat([{ cells: cells.slice(), on: true }]) }))
    persist(get())
  },
  togglePattern: (i) => {
    set((s) => ({ patterns: s.patterns.map((p, j) => (j === i ? { ...p, on: !p.on } : p)) }))
    persist(get())
  },
  removePattern: (i) => {
    set((s) => {
      const patterns = s.patterns.filter((_, j) => j !== i)
      return { patterns, patternIdx: 0 }
    })
    persist(get())
  },
  selectPattern: (patternIdx) => {
    set({ patternIdx, popup: null })
    persist(get())
  },
  randomPattern: () => {
    const s = get()
    const on = s.patterns.map((p, i) => ({ p, i })).filter((o) => o.p.on)
    if (!on.length) return
    set({ patternIdx: on[Math.floor(Math.random() * on.length)].i })
    persist(get())
  },

  // --- Coco lines ---------------------------------------------------------
  addLine: (key, text) => {
    const clean = text.trim()
    if (!clean) return
    set((s) => ({ [key]: s[key].concat([{ text: clean, on: true }]) }))
    persist(get())
  },
  toggleLine: (key, i) => {
    set((s) => ({ [key]: s[key].map((l, j) => (j === i ? { ...l, on: !l.on } : l)) }))
    persist(get())
  },
  removeLine: (key, i) => {
    set((s) => ({ [key]: s[key].filter((_, j) => j !== i) }))
    persist(get())
  },
  /** A random enabled line, or '' when every line for that mood is off. */
  pickLine: (key) => {
    const on = (get()[key] || []).filter((l) => l.on && l.text.trim())
    if (!on.length) return ''
    return on[Math.floor(Math.random() * on.length)].text
  },

  // --- character positions ------------------------------------------------
  setCharPos: (which, pos) => {
    set(which === 'koko' ? { kokoPos: pos } : { pixPos: pos })
    persist(get())
  },

  // --- reels --------------------------------------------------------------
  setLever: (lever, leverActive = get().leverActive) => set({ lever, leverActive }),

  /** Step one reel by `dir` chords (manual mode). */
  nudgeReel: (i, dir) => {
    const len = poolOf(get()).length
    set((s) => {
      const reelIdx = s.reelIdx.slice()
      reelIdx[i] = (((reelIdx[i] + dir) % len) + len) % len
      return { reelIdx }
    })
  },

  /** Set one reel to an absolute index (manual drag snap). */
  setReelIdx: (i, idx) => {
    const len = poolOf(get()).length
    set((s) => {
      const reelIdx = s.reelIdx.slice()
      reelIdx[i] = ((idx % len) + len) % len
      return { reelIdx }
    })
  },

  /**
   * Decide every result first, then run the animation toward those results, so
   * the drums cannot land anywhere else.
   */
  spin: () => {
    const s = get()
    if (s.reelSpin.some(Boolean)) return
    const pool = poolOf(s)
    const n = s.reelCount
    const results = Array.from({ length: n }, () => Math.floor(Math.random() * pool.length))

    clearSpinTimers()
    const reelSpin = [false, false, false, false, false, false]
    for (let i = 0; i < n; i++) reelSpin[i] = true
    set({ reelSpin, spinResults: results, spinToken: s.spinToken + 1 })

    // Fixed slot-machine timing: reel i lands at 1200 + i*500 ms, left to right.
    for (let i = 0; i < n; i++) {
      const cycle = setInterval(() => {
        set((st) => {
          const reelIdx = st.reelIdx.slice()
          reelIdx[i] = (reelIdx[i] + 1) % pool.length
          return { reelIdx }
        })
      }, SPIN_TICK_MS)

      const stop = setTimeout(() => {
        clearInterval(cycle)
        set((st) => {
          const reelIdx = st.reelIdx.slice()
          reelIdx[i] = results[i]
          const nextSpin = st.reelSpin.slice()
          nextSpin[i] = false
          const nextSettle = st.reelSettle.slice()
          nextSettle[i] = true
          return { reelIdx, reelSpin: nextSpin, reelSettle: nextSettle }
        })
        const settle = setTimeout(() => {
          set((st) => {
            const nextSettle = st.reelSettle.slice()
            nextSettle[i] = false
            return { reelSettle: nextSettle }
          })
        }, SPIN_SETTLE_MS)
        spinTimeouts.push(settle)
      }, SPIN_FIRST_STOP_MS + i * SPIN_STAGGER_MS)

      spinTimeouts.push(stop)
      spinIntervals.push(cycle)
    }
  },

  // --- transport ----------------------------------------------------------
  setPlaying: (playing) => set({ playing, beat: -1 }),
  setBeat: (beat) => set({ beat }),
  setReady3d: (ready3d) => set({ ready3d }),
}))

/** Total spin length for the current reel count, in ms. */
export const spinDurationMs = (reelCount) =>
  SPIN_FIRST_STOP_MS + (reelCount - 1) * SPIN_STAGGER_MS + SPIN_SETTLE_MS


/**
 * A read-only window handle for the browser test suite.
 *
 * With the machine rendered in WebGL there is no DOM to assert against — the chord
 * on each payline lives in a rotation, not an element. This exposes the state the
 * tests need to check, and the lever's on-screen box so a synthetic touch can find
 * it. Reads only; nothing here can drive the app.
 */
if (typeof window !== 'undefined') {
  window.__chordRoller = {
    state: () => {
      const s = useStore.getState()
      const pool = poolOf(s)
      return {
        reelCount: s.reelCount,
        reelIdx: s.reelIdx.slice(0, s.reelCount),
        chords: s.reelIdx.slice(0, s.reelCount).map((i) => pool[((i % pool.length) + pool.length) % pool.length].name),
        spinning: s.reelSpin.some(Boolean),
        pool: pool.map((c) => c.name),
        playing: s.playing,
        beat: s.beat,
        unlocked: s.unlocked,
        theme: s.theme,
        ready3d: s.ready3d,
      }
    },
  }
}
