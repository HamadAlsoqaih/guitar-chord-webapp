/**
 * Where the machine should lean, as -1..1 on each axis.
 *
 * Two sources feed the same value: pointer position (desktop, and a finger dragging
 * on the iPad) and the device's own orientation. The gyroscope is the touch-native
 * one, but iOS 13+ only exposes it over HTTPS *and* after an explicit grant from a
 * user gesture — so it is opt-in, and pointer movement is the fallback.
 */
const tilt = { x: 0, y: 0 }
let gyroActive = false
let listeners = new Set()

export const getTilt = () => tilt

export const needsGyroPermission = () =>
  typeof DeviceOrientationEvent !== 'undefined' &&
  typeof DeviceOrientationEvent.requestPermission === 'function'

export const gyroAvailable = () =>
  typeof window !== 'undefined' && typeof DeviceOrientationEvent !== 'undefined'

export const isGyroActive = () => gyroActive

const notify = () => listeners.forEach((fn) => fn(gyroActive))
export function onGyroChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Where the device was when the tilt was switched on; everything is relative to it. */
let baseline = null

const screenAngle = () => {
  const angle = window.screen?.orientation?.angle
  if (typeof angle === 'number') return angle
  return typeof window.orientation === 'number' ? window.orientation : 0
}

/**
 * Device tilt in the frame the person is actually looking at.
 *
 * gamma and beta are measured against the *device*, not the screen, so on a tablet
 * held in landscape they have swapped over: tilting it left and right moves beta,
 * and gamma is the one that changes when you tip it away from you. Reading gamma as
 * left-and-right is why this did nothing on an iPad in landscape — the axis it was
 * watching barely moved. Rotating the pair by the screen's own angle puts them back
 * the right way round.
 *
 * Exported so the mapping can be checked on its own; it is pure arithmetic.
 */
export function deviceToScreen(gamma, beta, angle) {
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: gamma * cos + beta * sin, y: beta * cos - gamma * sin }
}

function handleOrientation(event) {
  const { x, y } = deviceToScreen(event.gamma ?? 0, event.beta ?? 0, screenAngle())

  /*
   * The first reading is the rest position rather than some assumed angle. People
   * hold a tablet anywhere from flat on a table to nearly upright, and measuring
   * from wherever they are holding it means the machine is level to start with and
   * leans when they actually move.
   */
  if (!baseline) baseline = { x, y }
  tilt.x = Math.max(-1, Math.min(1, (x - baseline.x) / 26))
  tilt.y = Math.max(-1, Math.min(1, (y - baseline.y) / 26))
}

/** Take the current position as level again — after a rotation, say. */
export function recentreTilt() {
  baseline = null
}

export async function enableGyro() {
  if (!gyroAvailable()) return false
  try {
    if (needsGyroPermission()) {
      const result = await DeviceOrientationEvent.requestPermission()
      if (result !== 'granted') return false
    }
    baseline = null
    window.addEventListener('deviceorientation', handleOrientation)
    // Turning the iPad changes which way "sideways" is, so the rest position is
    // measured again rather than carried over from the old orientation.
    window.addEventListener('orientationchange', recentreTilt)
    window.screen?.orientation?.addEventListener?.('change', recentreTilt)
    gyroActive = true
    notify()
    return true
  } catch {
    return false
  }
}

export function startPointerTilt() {
  const onMove = (event) => {
    if (gyroActive) return
    tilt.x = (event.clientX / window.innerWidth) * 2 - 1
    tilt.y = (event.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  return () => window.removeEventListener('pointermove', onMove)
}
