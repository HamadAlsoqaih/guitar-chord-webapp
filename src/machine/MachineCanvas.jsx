import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store/useStore.js'
import { Scene } from './Scene.jsx'
import { busy, poke } from './activity.js'
import { tier } from './quality.js'

/**
 * Draw-call and triangle counts for the perf probe.
 *
 * three resets these counters on every render, and this scene renders twice a frame
 * (the refraction buffer, then the canvas). Turning autoReset off and resetting once
 * per frame here — before anything else runs, at priority -2 — makes the number the
 * true total for the whole frame rather than whichever pass happened to finish last.
 */
function RenderStats() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
    }
  }, [gl])

  useFrame(() => {
    if (typeof window !== 'undefined') {
      window.__r3fInfo = {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        frames: gl.info.render.frame,
        programs: gl.info.programs?.length ?? 0,
        textures: gl.info.memory.textures,
      }
    }
    gl.info.reset()
  }, -2)

  return null
}

/**
 * Decides when a frame is worth drawing.
 *
 * The scene runs on demand rather than on a free-running loop. While anything is
 * moving — a pull, a roll, a drag, the beat, the idle sway if it is switched on —
 * it asks for every frame the device will give. The rest of the time it asks for
 * twenty to thirty, which is plenty for a lamp chase and leaves the GPU alone.
 *
 * On a weak tablet that is the difference between a machine that is always warm and
 * one that only spends when there is something to show.
 */
function FrameGovernor() {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const idleFps = tier().idleFps
  const spinning = useStore((s) => s.reelSpin.some(Boolean))
  const playing = useStore((s) => s.playing)
  const beat = useStore((s) => s.beat)
  const reelCount = useStore((s) => s.reelCount)
  const theme = useStore((s) => s.theme)
  const pool = useStore((s) => s.known)
  const learn = useStore((s) => s.learn)

  // Any change worth animating gets a burst of full-rate frames.
  useEffect(() => {
    poke(spinning ? 4000 : 1400)
  }, [spinning, beat, playing, reelCount, theme, pool, learn])

  // A touch anywhere on the machine, even one that turns out to be a stray tap.
  useEffect(() => {
    const el = gl.domElement
    const wake = () => poke(900)
    el.addEventListener('pointerdown', wake, { passive: true })
    el.addEventListener('pointermove', wake, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', wake)
      el.removeEventListener('pointermove', wake)
    }
  }, [gl])

  useEffect(() => {
    let raf = 0
    let lastIdle = 0
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      if (busy()) {
        invalidate()
        lastIdle = now
        return
      }
      if (now - lastIdle >= 1000 / idleFps) {
        lastIdle = now
        invalidate()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [idleFps, invalidate])

  return null
}

/**
 * Keeps the app usable if the browser takes the WebGL context away.
 *
 * It does that on its own account — too many contexts alive, the tab backgrounded
 * on a device under memory pressure — and a canvas whose context has gone is a
 * blank rectangle where the machine used to be. Handing ready3d back puts the DOM
 * machine on screen instead, which plays exactly the same, and the 3D machine comes
 * back by itself when the browser restores the context.
 */
function ContextGuard({ onLost, onRestored }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event) => {
      // Without this the context is gone for good; with it the browser may restore.
      event.preventDefault()
      onLost()
    }
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [gl, onLost, onRestored])
  return null
}

export default function MachineCanvas() {
  const setReady3d = useStore((s) => s.setReady3d)
  const onPractice = useStore((s) => s.tab === 'home')
  const q = useRef(tier()).current
  const [dpr, setDpr] = useState(q.dpr)

  // Stop rendering entirely when the machine is not on screen — the app in the
  // background, or the settings page in front of it.
  const [awake, setAwake] = useState(true)
  useEffect(() => {
    const onVisibility = () => {
      setAwake(!document.hidden)
      if (!document.hidden) poke(600)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  const frameloop = awake && onPractice ? 'demand' : 'never'

  // Coming back to the practice page: draw at once rather than at the idle trickle.
  useEffect(() => {
    if (onPractice) poke(900)
  }, [onPractice])

  useEffect(() => {
    setReady3d(true)
    return () => setReady3d(false)
  }, [setReady3d])

  const onLost = useCallback(() => setReady3d(false), [setReady3d])
  const onRestored = useCallback(() => {
    setReady3d(true)
    poke(900)
  }, [setReady3d])

  return (
    <Canvas
      className="machine-canvas"
      dpr={dpr}
      frameloop={frameloop}

      gl={{
        // Multisampling is the first thing a weak GPU should not be paying for; at
        // two device pixels per CSS pixel the edges hold up without it.
        antialias: q.antialias,
        alpha: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      camera={{ position: [0, 1.4, 10], fov: 24 }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.05
      }}
    >
      <RenderStats />
      <ContextGuard onLost={onLost} onRestored={onRestored} />
      <FrameGovernor />
      <PerformanceMonitor
        // Resolution is the first thing to give: a slightly softer frame beats a
        // dropped one, and the machine keeps every detail either way.
        onDecline={() => setDpr(q.dprFloor)}
        onIncline={() => setDpr(q.dpr)}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </PerformanceMonitor>
    </Canvas>
  )
}
