import { Suspense, forwardRef, lazy, useEffect, useState } from 'react'
import { MachineFallback } from '../machine/MachineFallback.jsx'
import { useStore } from '../store/useStore.js'

const MachineCanvas = lazy(() => import('../machine/MachineCanvas.jsx'))

/** WebGL2 is required for the transmission glass and the post pass. */
function webglSupported() {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'))
  } catch {
    return false
  }
}

export const Practice = forwardRef(function Practice(_props, ref) {
  const ready3d = useStore((s) => s.ready3d)
  const [use3d, setUse3d] = useState(null)

  useEffect(() => {
    setUse3d(webglSupported())
  }, [])

  return (
    <div className="machine-area" ref={ref}>
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
