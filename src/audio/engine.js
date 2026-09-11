import {
  CLICK_ACCENT_GAIN,
  CLICK_ACCENT_HZ,
  CLICK_DECAY_S,
  CLICK_GAIN,
  CLICK_HZ,
} from '../store/defaults.js'

/**
 * Metronome built on a lookahead scheduler rather than a bare setInterval.
 *
 * A timer on the main thread drifts audibly — it is subject to layout, GC and
 * background throttling. Instead a 25ms timer looks 100ms ahead and books each
 * click against AudioContext.currentTime, which is sample-accurate. The timer
 * only has to be *roughly* on time; the audio clock does the real work.
 */
const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.1
const BEATS = 4

let ctx = null
let unlocked = false

/** iOS keeps an AudioContext suspended until it is resumed inside a user gesture. */
export function unlockAudio() {
  const c = getContext()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  if (unlocked) return
  // A zero-length silent buffer is the cheapest way to satisfy the gesture rule.
  try {
    const src = c.createBufferSource()
    src.buffer = c.createBuffer(1, 1, c.sampleRate)
    src.connect(c.destination)
    src.start(0)
    unlocked = true
  } catch {
    /* nothing to do; playback simply stays silent until the next gesture */
  }
}

export function getContext() {
  if (ctx) return ctx
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

function scheduleClick(at, accent) {
  const c = getContext()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.frequency.value = accent ? CLICK_ACCENT_HZ : CLICK_HZ
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(accent ? CLICK_ACCENT_GAIN : CLICK_GAIN, at + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + CLICK_DECAY_S)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(at)
  osc.stop(at + CLICK_DECAY_S + 0.02)
}

export class Metronome {
  constructor({ onBeat }) {
    this.onBeat = onBeat
    this.timer = null
    this.raf = null
    this.queue = []
    this.beat = 0
    this.nextNoteTime = 0
    this.bpm = 80
    this.sound = true
    this.running = false
  }

  setBpm(bpm) {
    this.bpm = bpm
  }

  setSound(sound) {
    this.sound = sound
  }

  start() {
    const c = getContext()
    if (!c || this.running) return
    unlockAudio()
    this.running = true
    this.beat = 0
    this.queue = []
    this.nextNoteTime = c.currentTime + 0.06
    this.tick()
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS)
    this.drawLoop()
  }

  stop() {
    this.running = false
    clearInterval(this.timer)
    this.timer = null
    cancelAnimationFrame(this.raf)
    this.raf = null
    this.queue = []
    this.onBeat(-1)
  }

  tick() {
    const c = getContext()
    if (!c || !this.running) return
    const spb = 60 / this.bpm
    while (this.nextNoteTime < c.currentTime + SCHEDULE_AHEAD_S) {
      // Beat 1 of the bar gets the higher accent click.
      if (this.sound) scheduleClick(this.nextNoteTime, this.beat === 0)
      this.queue.push({ beat: this.beat, time: this.nextNoteTime })
      this.nextNoteTime += spb
      this.beat = (this.beat + 1) % BEATS
    }
  }

  /**
   * The audio is already booked; this only moves the on-screen highlight to match
   * it, by draining the queue as the audio clock passes each scheduled time.
   */
  drawLoop() {
    const step = () => {
      if (!this.running) return
      const c = getContext()
      if (c) {
        let current = null
        while (this.queue.length && this.queue[0].time <= c.currentTime) current = this.queue.shift()
        if (current) this.onBeat(current.beat)
      }
      this.raf = requestAnimationFrame(step)
    }
    this.raf = requestAnimationFrame(step)
  }
}

/** One-shot UI sounds that are not part of the metronome grid. */
export function clack(strength = 1) {
  const c = getContext()
  if (!c || c.state !== 'running') return
  const at = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(220, at)
  osc.frequency.exponentialRampToValueAtTime(90, at + 0.07)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.12 * strength, at + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(at)
  osc.stop(at + 0.13)
}
