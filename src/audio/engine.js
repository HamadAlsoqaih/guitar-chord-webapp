import {
  CLICK_ACCENT_GAIN,
  CLICK_ACCENT_HZ,
  CLICK_DECAY_S,
  CLICK_GAIN,
  CLICK_HZ,
  LAND_DECAY_S,
  LAND_GAIN,
  LAND_ROOT_HZ,
  LAND_STEPS,
  REEL_TICK_DECAY_S,
  REEL_TICK_GAIN,
  REEL_TICK_HZ,
  REEL_TICK_MIN_MS,
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

/**
 * The machine's voice.
 *
 * Synthesised rather than sampled, and not for want of a sample: a recording has to
 * be chosen for a speed and then played at that speed, while a roll changes speed
 * the whole way through. These are built from the drums themselves — a tick when a
 * chord passes the payline, a bell when one lands — so the sound is the mechanism
 * rather than an impression of it, and it stays right whatever the reel count or
 * however long the roll runs.
 */

/** A short burst of noise, made once and replayed; the raw material for a tick. */
let noise = null
function noiseBuffer(c) {
  if (noise && noise.sampleRate === c.sampleRate) return noise
  const length = Math.floor(c.sampleRate * 0.05)
  const buffer = c.createBuffer(1, length, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    // Tapered, so the burst has a shape of its own before the envelope touches it.
    data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  }
  noise = buffer
  return buffer
}

/** Audio-clock time the next tick may start at; the gate the whole machine shares. */
let nextTick = 0
/** A frame's worth of ticks, at most, so one long frame cannot empty the voice pool. */
const MAX_TICKS_PER_FRAME = 6

/**
 * Chords crossing the payline.
 *
 * `count` is how many went past and `span` is the time they took, because a frame is
 * not an instant: at full speed a drum passes several chords between two frames, and
 * playing one of them at the moment the frame happens to land makes the rattle a
 * report of the frame rate rather than of the reel. Booking them across the span on
 * the audio clock — the same trick the metronome uses — means the rattle sounds the
 * same on a tablet drawing sixty frames a second and one drawing twenty.
 *
 * All the drums share one gate. Three reels running is one machine rattling, not
 * three, and without the gate the fast part of a roll is a tone rather than a sound
 * of something turning.
 */
export function reelTicks(count, span, strength = 1) {
  const c = getContext()
  if (!c || c.state !== 'running' || count < 1) return 0
  const now = c.currentTime
  const minGap = REEL_TICK_MIN_MS / 1000
  const step = Math.max(minGap, span / count)
  if (nextTick < now) nextTick = now

  let played = 0
  for (let i = 0; i < count && played < MAX_TICKS_PER_FRAME; i++) {
    const at = nextTick
    // Never book further ahead than the frame this actually belongs to, or a burst
    // would still be arriving after the drum had stopped.
    if (at > now + span + minGap) break
    nextTick = at + step
    tickAt(c, at, strength)
    played++
  }
  return played
}

function tickAt(c, at, strength) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  // A narrow band of noise reads as a detent knocking past; a pure tone reads as a
  // beep. The scatter stops a run of ticks sounding like one sample on repeat.
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = REEL_TICK_HZ * (0.86 + Math.random() * 0.28)
  band.Q.value = 7

  const gain = c.createGain()
  const level = REEL_TICK_GAIN * Math.min(1, Math.max(0.35, strength))
  gain.gain.setValueAtTime(level, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + REEL_TICK_DECAY_S)

  src.connect(band)
  band.connect(gain)
  gain.connect(c.destination)
  src.start(at)
  src.stop(at + REEL_TICK_DECAY_S + 0.01)
}

/**
 * A drum coming to rest: the detent taking it, then a bell.
 *
 * Each drum rings a step higher than the one before, so a three-reel roll lands as
 * a rising figure rather than the same note three times.
 */
export function land(index = 0) {
  const c = getContext()
  if (!c || c.state !== 'running') return
  const at = c.currentTime
  const step = LAND_STEPS[Math.min(index, LAND_STEPS.length - 1)]
  const root = LAND_ROOT_HZ * 2 ** (step / 12)

  // The strike: a scrap of noise for the edge of the sound, before the tone.
  const strike = c.createBufferSource()
  strike.buffer = noiseBuffer(c)
  const strikeBand = c.createBiquadFilter()
  strikeBand.type = 'bandpass'
  strikeBand.frequency.value = root * 1.6
  strikeBand.Q.value = 1.4
  const strikeGain = c.createGain()
  strikeGain.gain.setValueAtTime(LAND_GAIN * 0.7, at)
  strikeGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06)
  strike.connect(strikeBand)
  strikeBand.connect(strikeGain)
  strikeGain.connect(c.destination)
  strike.start(at)
  strike.stop(at + 0.08)

  // The bell. The partials are deliberately not whole multiples of the root —
  // struck metal is not harmonic, and spacing them this way is what stops it
  // sounding like an organ.
  const partials = [
    { ratio: 1, gain: 1, decay: LAND_DECAY_S },
    { ratio: 2.76, gain: 0.42, decay: LAND_DECAY_S * 0.6 },
    { ratio: 5.4, gain: 0.18, decay: LAND_DECAY_S * 0.35 },
  ]
  for (const { ratio, gain: level, decay } of partials) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = root * ratio
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(LAND_GAIN * level, at + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(at)
    osc.stop(at + decay + 0.02)
  }
}
