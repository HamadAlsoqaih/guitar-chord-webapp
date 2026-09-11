import { Suspense, forwardRef, lazy, useEffect, useState } from 'react'
import { MachineFallback } from '../machine/MachineFallback.jsx'
import { MachineSkeleton } from '../machine/MachineSkeleton.jsx'
import { useStore } from '../store/useStore.js'

const MachineCanvas = lazy(() => import('../machine/MachineCanvas.jsx'))

/**
 * WebGL2 is required for the refraction pass the glass depends on.
 *
 * Asked once, and the context used to ask is handed straight back. A browser will
 * only keep a few WebGL contexts alive at a time, and a probe that quietly holds
 * one forever is exactly the sort of thing that makes the real canvas fail later.
 */
let supported = null
function webglSupported() {
  if (supported !== null) return supported
  try {
    if (!window.WebGL2RenderingContext) return (supported = false)
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    supported = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return supported
  } catch {
    return (supported = false)
  }
}

export const Practice = forwardRef(function Practice({ hidden }, ref) {
  const ready3d = useStore((s) => s.ready3d)
  const [use3d, setUse3d] = useState(null)
  // Whether the 3D machine has ever been up. Before that, waiting is loading; after
  // it, waiting means the context went away and the DOM machine has to take over.
  const [everReady, setEverReady] = useState(false)

  useEffect(() => {
    setUse3d(webglSupported())
  }, [])

  useEffect(() => {
    if (ready3d) setEverReady(true)
  }, [ready3d])

  const fallback = use3d === false || (everReady && !ready3d)

  return (
    <div className="machine-area" ref={ref} hidden={hidden}>
      <div className="machine-slot">
        {/*
         * Loading shows a skeleton; the DOM machine appears only when it is the
         * machine rather than a stand-in — no WebGL at all, or a context lost after
         * the 3D machine had been running.
         */}
        {fallback && <MachineFallback />}
        {!ready3d && !fallback && <MachineSkeleton />}
        {use3d && (
          <Suspense fallback={null}>
            <MachineCanvas />
          </Suspense>
        )}
      </div>
    </div>
  )
})
