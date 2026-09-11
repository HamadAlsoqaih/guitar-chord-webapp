import { useCallback, useEffect, useRef, useState } from 'react'
import { LEVER_MAX_DEG, MANUAL_STEP_PX } from '../store/defaults.js'
import { poolOf, useStore } from '../store/useStore.js'
import { registerLever } from './leverBridge.js'
import { useLeverDrag } from './useLeverDrag.js'
import './fallback.css'

/**
 * The DOM machine. It renders immediately, works completely on its own, and stays
 * on screen until the WebGL machine has finished loading — so the app is never
 * unusable while a 3D bundle is in flight, and never breaks if WebGL is missing.
 */
export function MachineFallback() {
  const reelCount = useStore((s) => s.reelCount)
  const reelIdx = useStore((s) => s.reelIdx)
  const reelSpin = useStore((s) => s.reelSpin)
  const reelSettle = useStore((s) => s.reelSettle)
  const unlocked = useStore((s) => s.unlocked)
  const nudgeReel = useStore((s) => s.nudgeReel)
  const pool = useStore(poolOf)

  const ballRef = useRef(null)
  const armRef = useRef(null)
  const [spinning, setSpinning] = useState(false)
  const anySpinning = reelSpin.some(Boolean)

  useEffect(() => setSpinning(anySpinning), [anySpinning])

  const applyLever = useCallback((v) => {
    const arm = armRef.current
    if (!arm) return
    arm.style.transform = `rotate(${-v * LEVER_MAX_DEG}deg)`
    arm.dataset.settling = v === 0 ? 'true' : 'false'
  }, [])

  const { begin, tapPull } = useLeverDrag({ onChange: applyLever })

  useEffect(
    () =>
      registerLever({
        getRect: () => ballRef.current?.getBoundingClientRect() ?? null,
        pull: tapPull,
      }),
    [tapPull]
  )

  /** Manual mode: one chord per MANUAL_STEP_PX of drag, each reel on its own pointer. */
  const reelPointer = (i) => (e) => {
    if (!unlocked) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let last = e.clientY
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return
      const d = ev.clientY - last
      if (Math.abs(d) > MANUAL_STEP_PX) {
        nudgeReel(i, d > 0 ? -1 : 1)
        last = ev.clientY
      }
    }
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return
      el.releasePointerCapture?.(e.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const reels = []
  for (let i = 0; i < reelCount; i++) {
    const idx = (((reelIdx[i] || 0) % pool.length) + pool.length) % pool.length
    const current = pool[idx]
    reels.push(
      <div
        className="fb-reel"
        key={i}
        data-unlocked={unlocked}
        onPointerDown={reelPointer(i)}
        onWheel={(e) => unlocked && nudgeReel(i, e.deltaY > 0 ? 1 : -1)}
      >
        <div className="fb-roll" data-spin={reelSpin[i]} data-settle={reelSettle[i]}>
          <span className="fb-side">{pool[(idx - 1 + pool.length) % pool.length].name}</span>
          <span className="fb-main" data-tone={current.tone}>
            {current.name}
          </span>
          <span className="fb-side">{pool[(idx + 1) % pool.length].name}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="fb-wrap">
      <div className="fb-lever" onPointerDown={(e) => begin(e.clientY, e.pointerId)}>
        <div className="fb-arm" ref={armRef} data-settling="true">
          <div className="fb-ball" ref={ballRef} />
          <div className="fb-rod" />
        </div>
      </div>

      <div className="fb-machine">
        <div className="fb-sign">Chord Roller</div>
        <div className="fb-cabinet" data-spinning={spinning}>
          <div className="fb-reels">{reels}</div>
          <div className="fb-payline" />
        </div>
        <div className="fb-marquee">
          <span className="fb-bulb" />
          {reelCount} REELS · {pool.length} CHORDS
          <span className="fb-bulb" />
        </div>
      </div>
    </div>
  )
}
