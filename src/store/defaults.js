/**
 * Every tunable constant in the app, in one place.
 *
 * The values here were specified from the original Chord Machine prototype so the
 * rebuild behaves identically. Two clocks run in this app and they are deliberately
 * NOT coupled:
 *
 *   - Reel spin timing is fixed slot-machine timing (SPIN_*), independent of tempo.
 *   - BPM drives only the metronome and the strum grid highlight.
 */

export const STORAGE_KEY = 'chord-roller-v1'

/** Strum cell symbols: Down, Up, Rest. */
export const SYM = { D: '↓', U: '↑', R: '–' }
export const CELL_LABELS = ['1', '&', '2', '&', '3', '&', '4', '&']
export const CELLS_PER_PATTERN = 8

export const BPM_MIN = 30
export const BPM_MAX = 240
export const BPM_STEP = 5

export const REELS_MIN = 2
export const REELS_MAX = 6

/** Reel cycles one chord every this many ms while spinning. */
export const SPIN_TICK_MS = 100
/** First reel stops this long after the pull. */
export const SPIN_FIRST_STOP_MS = 1200
/** Each subsequent reel stops this much later than the one to its left. */
export const SPIN_STAGGER_MS = 500
/** Settle bounce after a reel lands. */
export const SPIN_SETTLE_MS = 440

/** Lever drag travel in CSS pixels, and the release fraction that commits a spin. */
export const LEVER_TRAVEL_PX = 90
export const LEVER_COMMIT = 0.55
/** Full pull angle, in degrees, about the horizontal axle. */
export const LEVER_MAX_DEG = 34
/** Tap-to-pull animation: total ms, and the fraction spent travelling down. */
export const LEVER_TAP_MS = 460
export const LEVER_TAP_DOWN_FRACTION = 0.45

/** Drag distance that advances a reel by one chord in manual mode. */
export const MANUAL_STEP_PX = 38

/** Metronome click tones. */
export const CLICK_ACCENT_HZ = 1400
export const CLICK_HZ = 950
export const CLICK_ACCENT_GAIN = 0.35
export const CLICK_GAIN = 0.2
export const CLICK_DECAY_S = 0.07

/**
 * The machine's own sounds.
 *
 * A tick for every chord that passes the payline, and a bell when a drum lands —
 * so a roll sounds like a reel running down and stopping, not like a timer.
 *
 * REEL_TICK_MIN_MS is what keeps the fast part of a roll from turning into a buzz.
 * At full speed a drum passes something like seventy chords a second; played one
 * for one that is a tone, not a rattle. Throttled, the ticks start as a blur and
 * thin out into separate clicks as the drum slows, which is the sound a real reel
 * makes.
 */
export const REEL_TICK_MIN_MS = 36
export const REEL_TICK_HZ = 2100
export const REEL_TICK_GAIN = 0.075
export const REEL_TICK_DECAY_S = 0.035

/** The bell on a landing: semitones above the root, one step per drum. */
export const LAND_STEPS = [0, 4, 7, 12, 16, 19]
export const LAND_ROOT_HZ = 1046.5
export const LAND_GAIN = 0.17
export const LAND_DECAY_S = 0.5

/** Speech bubble: ms per character while typing, then ms held on screen. */
export const BUBBLE_TYPE_MS = 45
export const BUBBLE_HOLD_MS = 2600

/** Pixel character frame flip while reacting. */
export const PIXEL_FRAME_MS = 260
export const PIXEL_REACT_MS = 1600

/** Character fall / tumble physics. */
export const FALL_TUMBLE_MS = 900
export const FALL_BASE_MS = 220
export const FALL_PER_PX_MS = 1.1
export const FALL_MAX_MS = 680
export const FALL_EASE_POWER = 2.2
export const TUMBLE_SPINS = [540, 900]
export const HOP_DELAY_MS = 620
export const HOP_MS = 520
export const HOP_LIFT_PX = 46
export const GROUND_GAP_PX = 4
export const EDGE_GAP_PX = 4
/** Pointer travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 6
/** How close to the lever a dropped character counts as "on the lever". */
export const LEVER_DROP_PAD = 30

/** Idle motion levels: how much the machine floats and leans when untouched. */
export const MOTION_LEVELS = ['off', 'subtle', 'strong']
export const MOTION_PRESETS = {
  off: { float: 0, tilt: 0 },
  subtle: { float: 0.014, tilt: 0.055 },
  strong: { float: 0.045, tilt: 0.145 },
}

export const CHAR_SIZE_MIN = 40
export const CHAR_SIZE_MAX = 200
export const CHAR_SIZE_STEP = 10

const chordList = (names, isOn) => names.map((name, i) => ({ name, on: isOn(i) }))

export function defaults() {
  return {
    theme: 'light',
    bpm: 80,
    reelCount: 3,
    sound: true,
    known: chordList(['A', 'C', 'D', 'E', 'G', 'Am', 'Em', 'Dm'], (i) => i < 5),
    learn: chordList(['B', 'F', 'Bm'], (i) => i === 1),
    patterns: [
      { cells: ['D', 'R', 'D', 'U', 'R', 'U', 'D', 'U'], on: true },
      { cells: ['D', 'R', 'D', 'R', 'D', 'R', 'D', 'R'], on: true },
      { cells: ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'], on: false },
    ],
    patternIdx: 0,
    sayTaps: [{ text: 'مرحبا انا كوكو, اتمنى تستمتعون في بوثي', on: true }],
    sayDrags: [{ text: 'انت لئيم اتركني', on: true }],
    sayFalls: [{ text: 'ايي, تعورت!', on: true }],
    kokoPos: null,
    pixPos: null,
    charMode: 'video',
    charSize: 100,
    motion: 'off',
  }
}

/** Keys that survive a reload. Everything else is session state. */
export const PERSISTED_KEYS = Object.keys(defaults())
