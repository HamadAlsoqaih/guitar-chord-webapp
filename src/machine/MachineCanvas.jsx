import { Suspense, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store/useStore.js'
import { Scene } from './Scene.jsx'

/** Capped at 2 on retina; the monitor can walk it down before the frame rate slips. */
const DPR_MAX = 2
const DPR_MIN = 1.25

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

export default function MachineCanvas() {
  const setReady3d = useStore((s) => s.setReady3d)
  const [dpr, setDpr] = useState(DPR_MAX)

  // Stop rendering entirely when the app is not on screen.
  const [frameloop, setFrameloop] = useState('always')
  useEffect(() => {
    const onVisibility = () => setFrameloop(document.hidden ? 'never' : 'always')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    setReady3d(true)
    return () => setReady3d(false)
  }, [setReady3d])

  return (
    <Canvas
      className="machine-canvas"
      dpr={dpr}
      frameloop={frameloop}

      gl={{
        antialias: true,
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
      <PerformanceMonitor
        // Resolution is the first thing to give: a slightly softer frame beats a
        // dropped one, and the machine keeps every detail either way.
        onDecline={() => setDpr(DPR_MIN)}
        onIncline={() => setDpr(DPR_MAX)}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </PerformanceMonitor>
    </Canvas>
  )
}
