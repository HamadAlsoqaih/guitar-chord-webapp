import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store/useStore.js'
import { Scene } from './Scene.jsx'

/** Capped at 2 on retina; the monitor can walk it down before the frame rate slips. */
const DPR_MAX = 2
const DPR_MIN = 1.25

/** Exposes draw-call and triangle counts for the perf probe. Dev diagnostics only. */
function RenderStats() {
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    if (typeof window !== 'undefined') {
      window.__r3fInfo = { calls: gl.info.render.calls, triangles: gl.info.render.triangles }
    }
  })
  return null
}

export default function MachineCanvas() {
  const setReady3d = useStore((s) => s.setReady3d)
  const [dpr, setDpr] = useState(DPR_MAX)
  const [quality, setQuality] = useState(new URLSearchParams(location.search).get('glass') === 'low' ? 'low' : 'high')
  const frameloopRef = useRef(null)

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
      ref={frameloopRef}
      className="machine-canvas"
      dpr={dpr}
      frameloop={frameloop}
      shadows
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
        onDecline={() => {
          // Drop resolution first; only give up the transmission glass if that isn't enough.
          setDpr((d) => {
            if (d > DPR_MIN) return DPR_MIN
            setQuality('low')
            return d
          })
        }}
        onIncline={() => setDpr(DPR_MAX)}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </PerformanceMonitor>
    </Canvas>
  )
}
