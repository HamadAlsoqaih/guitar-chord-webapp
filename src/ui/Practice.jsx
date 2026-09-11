import { Suspense, forwardRef, lazy, useEffect, useState } from 'react'
import { MachineFallback } from '../machine/MachineFallback.jsx'
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

  useEffect(() => {
    setUse3d(webglSupported())
  }, [])

  return (
    <div className="machine-area" ref={ref} hidden={hidden}>
      <div className="machine-slot">
        {/*
         * The DOM machine stays mounted and interactive until WebGL reports it has
         * taken over, so there is never a dead gap while the 3D chunk loads — and it
         * remains the permanent fallback where WebGL2 is unavailable.
         */}
        {!ready3d && <MachineFallback />}
        {use3d && (
          <Suspense fallback={null}>
            <MachineCanvas />
          </Suspense>
        )}
      </div>
    </div>
  )
})
