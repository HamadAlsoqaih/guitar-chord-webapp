/**
 * A tiny bridge between the 3D machine and the 2D character layer.
 *
 * Coco lives in the DOM, above the canvas; the lever lives in WebGL. Dropping Coco
 * onto the lever has to pull it, which means the character layer needs the lever's
 * position on screen and a way to trigger its animation — without either module
 * importing the other (the machine is lazily loaded and may not exist yet).
 */
let rectProvider = null
let pullHandler = null

export function registerLever({ getRect, pull }) {
  rectProvider = getRect || null
  pullHandler = pull || null
  return () => {
    if (rectProvider === getRect) rectProvider = null
    if (pullHandler === pull) pullHandler = null
  }
}

/** Screen-space box of the lever ball, or null while the machine is still loading. */
export function getLeverRect() {
  try {
    return rectProvider ? rectProvider() : null
  } catch {
    return null
  }
}

/** Plays the full pull animation and spins. No-op if the machine isn't mounted. */
export function pullLever() {
  if (pullHandler) pullHandler()
}

export function hasLever() {
  return !!rectProvider
}
