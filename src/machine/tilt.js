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

function handleOrientation(event) {
  // gamma: left/right tilt, beta: front/back. Normalised against a comfortable
  // range so a small wrist movement is enough and a big one does not spin it.
  const gamma = event.gamma ?? 0
  const beta = event.beta ?? 0
  tilt.x = Math.max(-1, Math.min(1, gamma / 30))
  tilt.y = Math.max(-1, Math.min(1, (beta - 45) / 30))
}

export async function enableGyro() {
  if (!gyroAvailable()) return false
  try {
    if (needsGyroPermission()) {
      const result = await DeviceOrientationEvent.requestPermission()
      if (result !== 'granted') return false
    }
    window.addEventListener('deviceorientation', handleOrientation)
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
