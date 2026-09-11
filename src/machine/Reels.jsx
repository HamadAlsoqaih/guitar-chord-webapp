import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import * as THREE from 'three'
import {
  MANUAL_STEP_PX,
  SPIN_FIRST_STOP_MS,
  SPIN_SETTLE_MS,
  SPIN_STAGGER_MS,
} from '../store/defaults.js'
import { poolOf, useStore } from '../store/useStore.js'
import { REEL_FACE, REEL_Y, reelRadius, reelX, reelZ, rotationForCell } from './geometry.js'
import { buildReelTexture, cellForPoolIndex } from './reelTexture.js'
import { behindGlass } from './ReelGlass.jsx'

const SEGMENTS = 44
/** Radians per second past which the printing smears. */
const BLUR_SPEED = 7
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The six drums.
 *
 * Results are decided by the store before anything animates; this component only
 * solves for the rotation that lands on the chosen chord and tweens to it, so a
 * drum physically cannot stop anywhere else.
 */
export function Reels({ onClack }) {
  const reelCount = useStore((s) => s.reelCount)
  const pool = useStore(poolOf)
  const spinToken = useStore((s) => s.spinToken)
  const unlocked = useStore((s) => s.unlocked)

  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const groupRef = useRef(null)
  const drums = useRef([])
  const spinState = useRef([])
  const lastRotation = useRef([0, 0, 0, 0, 0, 0])
  const tweens = useRef([])

  /**
   * Killing a GSAP tween does not run its onComplete, so the spin flags have to be
   * cleared here too — otherwise an interrupted spin leaves that drum showing the
   * smeared texture for good.
   */
  const killTweens = useCallback(() => {
    tweens.current.forEach((t) => t.kill())
    tweens.current = []
    spinState.current = []
  }, [])

  const { texture, blurred, cells } = useMemo(() => buildReelTexture(pool), [pool])
  const radius = reelRadius(cells)

  // One geometry shared by every drum; only their rotation differs.
  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(radius, radius, REEL_FACE, SEGMENTS, 1, true)
    geo.rotateZ(Math.PI / 2) // lay the drum on its side: axis along X
    return geo
  }, [radius])

  const materials = useMemo(
    () =>
      Array.from({ length: 6 }, () =>
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.74,
          metalness: 0.02,
        })
      ),
    [texture]
  )

  useEffect(
    () => () => {
      geometry.dispose()
      materials.forEach((m) => m.dispose())
      texture.dispose()
      blurred.dispose()
    },
    [geometry, materials, texture, blurred]
  )

  // Re-seat the drums whenever the pool changes, so the printed strip and the
  // logical index can never drift apart.
  useEffect(() => {
    const { reelIdx } = useStore.getState()
    drums.current.forEach((drum, i) => {
      if (!drum) return
      const cell = cellForPoolIndex(reelIdx[i] || 0, pool.length, cells)
      drum.rotation.x = rotationForCell(cell, cells)
    })
  }, [pool, cells])

  /** Run the whole spin: decided results, staggered stops, overshoot, settle. */
  useEffect(() => {
    if (!spinToken) return undefined
    const state = useStore.getState()
    const results = state.spinResults
    if (!results) return undefined
    const n = results.length
    const slow = reducedMotion()

    killTweens()

    for (let i = 0; i < n; i++) {
      const drum = drums.current[i]
      if (!drum) continue
      const targetCell = cellForPoolIndex(results[i], pool.length, cells)
      const target = rotationForCell(targetCell, cells)

      // Always travel forwards to the next matching rotation, plus whole turns, so
      // the drum never appears to reverse into its result.
      const turns = slow ? 1 : 4 + i
      const from = drum.rotation.x
      const ahead = ((target - from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
      const to = from + ahead + turns * Math.PI * 2

      const durationMs = SPIN_FIRST_STOP_MS + i * SPIN_STAGGER_MS
      const duration = (slow ? durationMs * 0.55 : durationMs) / 1000

      const tl = gsap.timeline()
      // Anticipation: a short nudge backwards before the drum takes off.
      if (!slow) {
        tl.to(drum.rotation, { x: from - 0.075, duration: 0.11, ease: 'power2.out' })
      }
      tl.to(drum.rotation, {
        x: to,
        duration,
        ease: 'power3.inOut',
        onStart: () => {
          spinState.current[i] = 1
        },
        onComplete: () => {
          spinState.current[i] = 0
          onClack?.(i)
        },
      })
      // Overshoot and settle, the way a real drum rocks back onto its detent.
      tl.to(drum.rotation, {
        x: to + 0.055,
        duration: SPIN_SETTLE_MS / 2600,
        ease: 'power2.out',
      })
      tl.to(drum.rotation, {
        x: to,
        duration: SPIN_SETTLE_MS / 1400,
        ease: 'elastic.out(1, 0.42)',
      })
      tweens.current.push(tl)
    }

    return killTweens
  }, [spinToken, pool.length, cells, onClack, killTweens])

  /**
   * Swap to the smeared strip from the drum's actual angular speed, not from a
   * spinning flag. The drum is sharp through the anticipation nudge, blurs as it
   * accelerates, and comes back sharp as it decelerates into its stop — all for
   * free, and it can never get stuck blurred.
   */
  useFrame((_, delta) => {
    for (let i = 0; i < materials.length; i++) {
      const drum = drums.current[i]
      const material = materials[i]
      if (!drum) continue
      const speed = delta > 0 ? Math.abs(drum.rotation.x - lastRotation.current[i]) / delta : 0
      lastRotation.current[i] = drum.rotation.x
      const want = speed > BLUR_SPEED ? blurred : texture
      if (material.map !== want) {
        material.map = want
        material.needsUpdate = true
      }
    }
    // Drums ease toward their slot as the reel count changes, instead of popping.
    const group = groupRef.current
    if (group) {
      const ease = Math.min(1, delta * 9)
      for (let i = 0; i < group.children.length; i++) {
        const target = reelX(i, reelCount)
        const child = group.children[i]
        child.position.x += (target - child.position.x) * ease
      }
    }
  })

  /** Manual mode: drag a drum to step through chords, then snap to the nearest. */
  const manualDrag = (i) => (event) => {
    if (!useStore.getState().unlocked) return
    event.stopPropagation()
    const drum = drums.current[i]
    if (!drum) return
    const pointerId = event.pointerId
    const target = event.target
    // Capture keeps the drag alive if the finger slides off the drum. It can throw
    // for a pointer the browser no longer considers active, and losing the drag
    // entirely over a failed nicety would be worse than not capturing.
    try {
      target?.setPointerCapture?.(pointerId)
    } catch {
      /* carry on without capture */
    }
    let last = event.clientY

    const move = (ev) => {
      if (ev.pointerId !== pointerId) return
      const d = ev.clientY - last
      if (Math.abs(d) <= MANUAL_STEP_PX) return
      last = ev.clientY

      // Dragging down rolls the chords downward: the drum turns one cell forward
      // and the pool index steps back, which is the same pairing the spin uses.
      const down = d > 0
      useStore.getState().nudgeReel(i, down ? -1 : 1)
      gsap.to(drum.rotation, {
        x: drum.rotation.x + ((down ? 1 : -1) * Math.PI * 2) / cells,
        duration: 0.22,
        ease: 'power2.out',
        overwrite: true,
      })
    }
    const up = (ev) => {
      if (ev.pointerId !== pointerId) return
      try {
        target?.releasePointerCapture?.(pointerId)
      } catch {
        /* nothing to release */
      }
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      // Snap onto the nearest detent so a drum never rests between chords.
      const step = (Math.PI * 2) / cells
      const snapped = Math.round((drum.rotation.x - step / 2) / step) * step + step / 2
      gsap.to(drum.rotation, { x: snapped, duration: 0.3, ease: 'back.out(2)', overwrite: true })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    window.__chordRollerReels = {
      rects: () => {
        const bounds = gl.domElement.getBoundingClientRect()
        const point = new THREE.Vector3()
        return drums.current.slice(0, reelCount).map((drum) => {
          if (!drum) return null
          drum.getWorldPosition(point).project(camera)
          return {
            x: bounds.left + ((point.x + 1) / 2) * bounds.width,
            y: bounds.top + ((1 - point.y) / 2) * bounds.height,
          }
        })
      },
    }
    return () => {
      delete window.__chordRollerReels
    }
  }, [camera, gl, reelCount])

  return (
    <group ref={groupRef} position={[0, REEL_Y, reelZ(cells)]}>
      {Array.from({ length: reelCount }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            drums.current[i] = el
            behindGlass(el)
          }}
          geometry={geometry}
          material={materials[i]}
          position={[reelX(i, reelCount), 0, 0]}
          onPointerDown={manualDrag(i)}
          userData={{ manual: unlocked }}
        />
      ))}
    </group>
  )
}
