/**
 * How hard to push the machine on this device.
 *
 * Everything expensive in this scene is fill rate: the refraction buffer, the
 * canvas itself, and multisampling on top of both. On a fast tablet all three can
 * run flat out; on a weak one the same frame costs several times as much for
 * differences nobody can see at arm's length. So the tier decides the pixels, and
 * the look — the machined cabinet, the curved glass, the lamps, the neon — is
 * identical at every tier. Nothing is ever removed, only rasterised smaller.
 *
 * The tier is a starting guess from what the device will admit to. It is only a
 * guess, so PerformanceMonitor can still walk the resolution down from there at
 * runtime; this just means a slow device does not have to spend its first seconds
 * dropping frames before that happens.
 */
export const TIERS = {
  high: {
    name: 'high',
    dpr: 2,
    dprFloor: 1.4,
    /** Refraction buffer, as a fraction of the canvas. */
    glass: 1,
    chroma: true,
    sweep: 0.42,
    antialias: true,
    envResolution: 128,
    shadowResolution: 256,
    /** Frames per second while nothing is happening. */
    idleFps: 30,
  },
  medium: {
    name: 'medium',
    dpr: 1.75,
    dprFloor: 1.2,
    glass: 0.7,
    chroma: true,
    sweep: 0.42,
    antialias: false,
    envResolution: 128,
    shadowResolution: 256,
    idleFps: 24,
  },
  low: {
    name: 'low',
    dpr: 1.25,
    dprFloor: 1,
    glass: 0.5,
    // One texture fetch through the pane instead of three.
    chroma: false,
    sweep: 0.28,
    antialias: false,
    envResolution: 64,
    shadowResolution: 128,
    idleFps: 20,
  },
}

let cached = null

export function tier() {
  if (cached) return cached
  cached = TIERS[detect()] || TIERS.medium
  return cached
}

/** Override from the URL, for testing a tier this machine would not pick. */
function fromQuery() {
  if (typeof location === 'undefined') return null
  const asked = new URLSearchParams(location.search).get('quality')
  return asked && TIERS[asked] ? asked : null
}

function detect() {
  const asked = fromQuery()
  if (asked) return asked
  if (typeof navigator === 'undefined') return 'medium'

  const cores = navigator.hardwareConcurrency || 2
  // Only Chromium reports this; absent is not evidence of anything either way.
  const memory = navigator.deviceMemory || 0
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const pixels = typeof window !== 'undefined' ? window.innerWidth * window.innerHeight * dpr * dpr : 0

  if (cores <= 2 || (memory && memory <= 2)) return 'low'
  // A big retina canvas on a modest chip is the combination that stutters: it is
  // the pixel count that hurts, not the core count on its own.
  if (cores <= 4 && pixels > 2.2e6) return 'low'
  if (cores <= 4 || (memory && memory <= 4)) return 'medium'
  if (pixels > 6e6 && cores <= 6) return 'medium'
  return 'high'
}
