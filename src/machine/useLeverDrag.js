import { useCallback, useEffect, useRef } from 'react'
import {
  LEVER_COMMIT,
  LEVER_TAP_DOWN_FRACTION,
  LEVER_TAP_MS,
  LEVER_TRAVEL_PX,
} from '../store/defaults.js'
import { useStore } from '../store/useStore.js'
import { poke } from './activity.js'

/**
 * Shared lever behaviour for whichever renderer is on screen.
 *
 * Reports travel as 0..1 through `onChange` so the 2D and 3D levers can map it to
 * their own geometry. Release past LEVER_COMMIT spins; anything less springs back.
 */
export function useLeverDrag({ onChange, onCommit, onRelease }) {
  const spin = useStore((s) => s.spin)
  const valueRef = useRef(0)
  const rafRef = useRef(0)
  const pointerRef = useRef(null)

  const emit = useCallback(
    (v) => {
      valueRef.current = v
      // The lever is being worked: the arm, and the spring back after it, both
      // need every frame they can get.
      poke(700)
      onChange?.(v)
    },
    [onChange]
  )

  const release = useCallback(
    (committed) => {
      if (committed) {
        onCommit?.()
        spin()
      }
      onRelease?.(committed)
      emit(0)
    },
    [emit, onCommit, onRelease, spin]
  )

  /** Tap: run the whole pull for the user — down fast, back up, then spin. */
  const tapPull = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const t0 = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - t0) / LEVER_TAP_MS)
      const v =
        p < LEVER_TAP_DOWN_FRACTION
          ? p / LEVER_TAP_DOWN_FRACTION
          : 1 - (p - LEVER_TAP_DOWN_FRACTION) / (1 - LEVER_TAP_DOWN_FRACTION)
      emit(v)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
      else {
        emit(0)
        onCommit?.()
        spin()
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [emit, onCommit, spin])

  const begin = useCallback(
    (clientY, pointerId) => {
      // One finger owns the lever; later pointers are ignored until it lets go.
      if (pointerRef.current !== null) return false
      pointerRef.current = pointerId
      cancelAnimationFrame(rafRef.current)
      const startY = clientY
      let moved = false

      const move = (ev) => {
        if (ev.pointerId !== pointerId) return
        const travel = Math.max(0, Math.min(LEVER_TRAVEL_PX, ev.clientY - startY))
        if (travel > 3) moved = true
        emit(travel / LEVER_TRAVEL_PX)
      }
      const up = (ev) => {
        if (ev.pointerId !== pointerId) return
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        pointerRef.current = null
        if (!moved) {
          tapPull()
          return
        }
        release(valueRef.current > LEVER_COMMIT)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      return true
    },
    [emit, release, tapPull]
  )

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  return { begin, tapPull, valueRef }
}
