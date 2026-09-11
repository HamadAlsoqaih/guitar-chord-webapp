import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import * as THREE from 'three'
import { MOTION_PRESETS } from '../store/defaults.js'
import { poolOf, useStore } from '../store/useStore.js'
import { clack } from '../audio/engine.js'
import { Cabinet, LeverMount } from './Cabinet.jsx'
import { Lever3D } from './Lever3D.jsx'
import { Reels } from './Reels.jsx'
import { Bulbs, MarqueePlate, NeonSign } from './Trim.jsx'
import { CABINET_D, CABINET_H, LEVER_OVERHANG, SIGN_H, SIGN_Y, cabinetWidth } from './geometry.js'
import { cellsAround } from './reelTexture.js'
import { getTilt, startPointerTilt } from './tilt.js'
import { poke } from './activity.js'
import { invalidateGlass } from './ReelGlass.jsx'
import { tier } from './quality.js'
import { BLUE, NEON } from './materials.js'

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The framed box, sized to the machine's real extent — the cabinet's bottom edge up
 * to the top of the sign — rather than a padded guess, so the machine fills the
 * space it is given instead of floating in it.
 */
const CONTENT_TOP = SIGN_Y + 0.4
const CONTENT_BOTTOM = -CABINET_H / 2
/*
 * Headroom around the machine, and the reason the camera can push in at all.
 *
 * The pull dollies the camera forward, which magnifies everything in frame. Framed
 * to the machine's exact extent there is nowhere for that to go, so the sign loses
 * its top and the cabinet its feet at the moment the roll starts — which is the
 * moment everyone is looking. The margin is the room the push moves into, and the
 * push is derived from it below rather than guessed, so the two cannot drift apart.
 */
const FRAME_MARGIN = 1.07
const SCENE_H = (CONTENT_TOP - CONTENT_BOTTOM) * FRAME_MARGIN
/**
 * How far the pull dollies in, as a fraction of the fitted distance. Kept under the
 * margin above so the machine grows into reserved room and never past it.
 */
const PUSH_FRACTION = 0.04
/** Vertical centre of that extent; the camera looks here, not at the origin. */
const FOCUS_Y = (CONTENT_TOP + CONTENT_BOTTOM) / 2
const FOV = 24

export function Scene() {
  const reelCount = useStore((s) => s.reelCount)
  const theme = useStore((s) => s.theme)
  const motion = useStore((s) => s.motion)
  const reelSpin = useStore((s) => s.reelSpin)
  const pool = useStore(poolOf)
  const cells = cellsAround(pool.length)

  const widthRef = useRef(cabinetWidth(reelCount))
  const spinningRef = useRef(false)
  const winRef = useRef(-9999)
  const cameraOffset = useRef(0)
  /** Written by FitCamera; the push is a fraction of it, so it scales with the framing. */
  const baseZ = useRef(10)
  const jolt = useRef({ y: 0, v: 0 })
  const rootRef = useRef(null)

  const anySpinning = reelSpin.some(Boolean)
  useEffect(() => {
    spinningRef.current = anySpinning
  }, [anySpinning])

  const dark = theme === 'dark'
  const reduce = prefersReducedMotion()
  const preset = MOTION_PRESETS[reduce ? 'off' : motion] || MOTION_PRESETS.off

  /** Each drum landing gets a click and a small kick to the cabinet. */
  const onClack = useCallback((index) => {
    clack(0.8)
    // The cabinet rings for about a second after a landing.
    poke(1200)
    jolt.current.v -= 0.05
    const { reelCount: n } = useStore.getState()
    if (index === n - 1) winRef.current = performance.now()
  }, [])

  /** The pull itself: a jolt, and a slow camera push that eases back as reels land. */
  const onCommit = useCallback(() => {
    jolt.current.v -= 0.11
    // The camera push and its return run for a little over three seconds.
    poke(3600)
    if (reduce) return
    gsap.killTweensOf(cameraOffset)
    gsap.to(cameraOffset, {
      // Exactly the margin, so the machine grows into the room reserved for it and
      // never a pixel further.
      current: -PUSH_FRACTION * (baseZ.current - CABINET_D / 2),
      duration: 0.85,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(cameraOffset, { current: 0, duration: 1.6, ease: 'power2.inOut', delay: 0.9 })
      },
    })
  }, [reduce])

  useEffect(() => (preset.tilt > 0 ? startPointerTilt() : undefined), [preset.tilt])

  // Idle motion, when it is switched on, is a continuous animation of the whole
  // cabinet — and it moves the machine behind the glass, so both the frame rate and
  // the refraction buffer have to keep up with it.
  const floating = preset.float > 0
  useEffect(() => {
    if (!floating) return undefined
    const id = setInterval(() => {
      poke(1200)
      invalidateGlass(1200)
    }, 800)
    poke(1200)
    invalidateGlass(1200)
    return () => clearInterval(id)
  }, [floating])

  // Cabinet jolt: a light spring so the kick from a pull or a landing decays naturally.
  useFrame((state, delta) => {
    const j = jolt.current
    j.v += -j.y * 46 * delta
    j.v *= Math.exp(-9 * delta)
    j.y += j.v * delta

    const root = rootRef.current
    if (!root) return

    let y = j.y
    let tiltX = 0
    let tiltY = 0
    if (preset.float > 0) {
      y += Math.sin(state.clock.elapsedTime * 0.9) * preset.float
      // Lean toward the pointer, or the gyroscope — both write the same values.
      const lean = getTilt()
      tiltY = lean.x * preset.tilt
      tiltX = -lean.y * preset.tilt * 0.6
    }
    root.position.y = y
    root.rotation.y += (tiltY - root.rotation.y) * Math.min(1, delta * 4)
    root.rotation.x += (tiltX - root.rotation.x) * Math.min(1, delta * 4)
  })

  /*
   * The machine's silhouette in screen pixels, for the browser tests.
   *
   * Whether the framing still holds while the camera pushes in is not something to
   * judge from a screenshot. This projects the parts that have to stay in frame —
   * the cabinet, the sign above it and the lever ball out to the left — rather than
   * the scene's bounding box, which is inflated by the glow quads and the light
   * wash around the neon and would never agree with what anyone can see.
   */
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const point = new THREE.Vector3()
    window.__chordRollerFrame = () => {
      const root = rootRef.current
      if (!root) return null
      const { reelCount: n } = useStore.getState()
      const halfW = cabinetWidth(n) / 2
      const xs = [-(halfW + LEVER_OVERHANG * 0.62), halfW]
      const ys = [-CABINET_H / 2, SIGN_Y + SIGN_H / 2]
      const zs = [-CABINET_D / 2, CABINET_D / 2]
      const rect = gl.domElement.getBoundingClientRect()
      let top = Infinity
      let bottom = -Infinity
      let left = Infinity
      let right = -Infinity
      for (const x of xs) {
        for (const y of ys) {
          for (const z of zs) {
            point.set(x, y, z)
            root.localToWorld(point)
            point.project(camera)
            const px = rect.left + ((point.x + 1) / 2) * rect.width
            const py = rect.top + ((1 - point.y) / 2) * rect.height
            top = Math.min(top, py)
            bottom = Math.max(bottom, py)
            left = Math.min(left, px)
            right = Math.max(right, px)
          }
        }
      }
      return {
        machine: { top, bottom, left, right },
        canvas: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      }
    }
    return () => {
      delete window.__chordRollerFrame
    }
  }, [camera, gl])

  // Further out from the flank, on a longer bracket: the arm reads as a handle you
  // reach for rather than something tucked against the body.
  const leverX = -(cabinetWidth(reelCount) / 2 + 0.66)

  return (
    <>
      <FitCamera reelCount={reelCount} offsetRef={cameraOffset} baseZRef={baseZ} />
      <Lighting dark={dark} />

      <group ref={rootRef}>
        <Cabinet reelCount={reelCount} widthRef={widthRef} cells={cells} dark={dark} />
        <Reels onClack={onClack} />
        <Bulbs widthRef={widthRef} spinningRef={spinningRef} winRef={winRef} />
        <NeonSign widthRef={widthRef} />
        <MarqueePlate widthRef={widthRef} />
        <LeverMount x={leverX} edgeX={-cabinetWidth(reelCount) / 2} />
        <Lever3D x={leverX} onCommit={onCommit} />
        <WinBurst winRef={winRef} />
      </group>

      <ContactShadows
        frames={1}
        position={[0, -CABINET_H / 2 - 0.02, 0]}
        scale={12}
        blur={2.6}
        opacity={dark ? 0.75 : 0.42}
        far={3}
        resolution={tier().shadowResolution}
      />
    </>
  )
}

/**
 * Frames the machine for the current canvas. The box is wide and short, so which
 * dimension binds changes with the reel count and the orientation.
 */
function FitCamera({ reelCount, offsetRef, baseZRef }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const baseZ = baseZRef

  useEffect(() => {
    // Reserve the lever's reach on both sides so the cabinet stays screen-centred.
    // The same margin sideways: at six reels the width is what binds, and without it
    // the push would crop the lever and the cabinet's flanks instead of the sign.
    const width = (cabinetWidth(reelCount) + LEVER_OVERHANG * 2) * FRAME_MARGIN
    const aspect = size.width / Math.max(1, size.height)
    const vFov = (FOV * Math.PI) / 180
    const forHeight = SCENE_H / 2 / Math.tan(vFov / 2)
    const forWidth = width / 2 / Math.tan(vFov / 2) / aspect
    /*
     * The machine is a box, not a picture. Its front face stands half a unit nearer
     * than the plane this fit is solved for, and at this distance that magnifies it
     * by around eight per cent — enough on its own to push the sign off the top of
     * the canvas. Standing off by the cabinet's own depth is what makes the framing
     * mean what it says.
     */
    baseZ.current = Math.max(forHeight, forWidth) + CABINET_D / 2

    camera.fov = FOV
    camera.near = 0.5
    camera.far = 60
    camera.updateProjectionMatrix()
  }, [camera, reelCount, size])

  const target = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const z = baseZ.current + (offsetRef.current ?? 0)
    // ~8° above the machine's visual centre, which sits above the cabinet's middle
    // because the sign occupies the top of the frame.
    const focus = 0.3
    /*
     * Height comes from the resting distance, not the current one, so the pull is a
     * straight dolly in. Tying it to the live distance tilts the camera as it moves
     * — the view swings down, the cabinet's feet leave the frame at the bottom, and
     * the margin reserved above the sign is spent on nothing.
     */
    target.set(0, focus + baseZ.current * 0.14, z)
    camera.position.lerp(target, Math.min(1, delta * 5))
    camera.lookAt(0, focus, 0)
  })

  return null
}

/**
 * Key, rim and environment. The theme swaps the whole mood, not just the page.
 *
 * Memoised because the environment probe bakes on mount: re-rendering this for any
 * other reason sends it back to re-render its cubemap.
 */
const Lighting = memo(function Lighting({ dark }) {
  const fog = useMemo(
    () => new THREE.FogExp2(dark ? '#05070d' : '#dfe4ef', dark ? 0.028 : 0.012),
    [dark]
  )

  return (
    <>
      {/* No background colour: the canvas is transparent so the machine sits on the
          page rather than inside a visible grey box. */}
      <primitive object={fog} attach="fog" />

      <ambientLight intensity={dark ? 0.3 : 0.62} />
      {/*
        * No shadow map. It re-rendered every caster into a depth pass on every
        * frame and bought almost nothing: the machine is a flat-fronted box lit
        * head-on, so it barely self-shadows, and the shadow that actually reads is
        * the contact shadow below it — which is baked once and then frozen.
        */}
      <directionalLight
        position={[4.5, 6, 6]}
        intensity={dark ? 1.35 : 1.75}
        color={dark ? '#c9d8ff' : '#ffffff'}
      />
      {/* Blue rim from behind-left, carrying over the blue glow from the old design. */}
      <directionalLight position={[-6, 2, -4]} intensity={dark ? 2.2 : 0.9} color={BLUE} />
      <pointLight position={[0, -1.6, 3]} intensity={dark ? 0.5 : 0.3} color={NEON} distance={9} decay={2} />

      {/*
       * Baked once (frames={1}): the reflections the glass and the lever ball need,
       * without re-rendering an environment probe on every frame.
       */}
      <Environment frames={1} resolution={tier().envResolution}>
        {/* A softbox rig: the reflections a metal cabinet and a gloss ball need. */}
        <Lightformer intensity={dark ? 2.4 : 4.2} position={[0, 5, 4]} scale={[11, 4, 1]} />
        <Lightformer intensity={dark ? 2.2 : 2.6} position={[7, 1, 5]} scale={[5, 8, 1]} />
        <Lightformer intensity={dark ? 1.4 : 2.2} position={[-7, 1, 5]} scale={[5, 8, 1]} />
        <Lightformer intensity={dark ? 2.2 : 1.1} color={BLUE} position={[-6, 2, -4]} scale={[7, 6, 1]} />
        <Lightformer intensity={dark ? 1.2 : 0.7} color={NEON} position={[0, -3, 4]} scale={[8, 2, 1]} />
      </Environment>
    </>
  )
})

/** A soft burst of light behind the result row when a roll lands. */
function WinBurst({ winRef }) {
  const lightRef = useRef(null)

  useFrame(() => {
    const light = lightRef.current
    if (!light) return
    const since = performance.now() - winRef.current
    const lit = since < 750
    light.intensity = lit ? (1 - since / 750) ** 2 * 9 : 0
    // This light falls on the drums, which are behind the glass: while it is
    // fading the refraction buffer is out of date even though nothing has moved.
    if (lit) invalidateGlass(0)
  })

  return <pointLight ref={lightRef} color={NEON} position={[0, 0.12, -0.4]} distance={7} decay={2} intensity={0} />
}
