/**
 * Is anything actually moving?
 *
 * The scene renders on demand rather than on a free-running loop, so something has
 * to say when a frame is worth drawing. Everything that starts a motion — a pull, a
 * spin, a drag, a landing, a beat — pokes this, and the frame governor draws at full
 * rate until the poke expires, then drops back to an idle trickle that is still fast
 * enough for the lamp chase to read as a chase.
 *
 * Deliberately a module-level value and not store state: it is written several times
 * per gesture and read every frame, and neither has any business re-rendering React.
 */
let until = 0

/** Something is happening; keep drawing at full rate for `ms`. */
export function poke(ms = 900) {
  const end = performance.now() + ms
  if (end > until) until = end
}

export function busy() {
  return performance.now() < until
}
