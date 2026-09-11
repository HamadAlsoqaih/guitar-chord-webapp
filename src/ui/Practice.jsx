import { forwardRef } from 'react'
import { MachineFallback } from '../machine/MachineFallback.jsx'

export const Practice = forwardRef(function Practice(_props, ref) {
  return (
    <div className="machine-area" ref={ref}>
      <div className="machine-slot">
        <MachineFallback />
      </div>
    </div>
  )
})
