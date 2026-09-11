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
    dprFloor: 1.5,
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
    // Still every device pixel. Resolution is what the chords are read at, so it
    // is the last thing to give up — the savings here come from the buffer behind
    // the glass and from dropping multisampling, neither of which anyone can see.
    dpr: 2,
    dprFloor: 1.4,
    glass: 0.75,
    chroma: true,
    sweep: 0.42,
    // Kept on. This tier is where most tablets land, and the neon and the lamp
    // rims are exactly the kind of thin bright edge that crawls without it.
    antialias: true,
    envResolution: 128,
    shadowResolution: 256,
    idleFps: 30,
  },
  low: {
    name: 'low',
    dpr: 1.5,
    dprFloor: 1.25,
    glass: 0.5,
    // One texture fetch through the pane instead of three.
    chroma: false,
    sweep: 0.28,
    antialias: false,
    envResolution: 64,
    shadowResolution: 128,
    idleFps: 24,
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
  if (typeof navigator === 'undefined') return 'high'

  const cores = navigator.hardwareConcurrency || 4
  // Only Chromium reports this; absent is not evidence of anything either way.
  const memory = navigator.deviceMemory || 0

  /*
   * Start high and come down only on real evidence.
   *
   * The temptation is to read a modest core count as a slow device, but a tablet
   * with four cores and a good GPU renders this scene without noticing, and
   * demoting it costs resolution on the one thing people are here to read. So the
   * only things that demote are a genuinely small machine, and after that it is
   * PerformanceMonitor's job — it measures actual frames rather than guessing from
   * a spec sheet, and walks the resolution down within whatever tier we picked.
   */
  if (cores <= 2 || (memory && memory <= 2)) return 'low'
  if (cores <= 4 || (memory && memory <= 4)) return 'medium'
  return 'high'
}
