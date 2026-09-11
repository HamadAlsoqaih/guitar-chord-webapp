import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'

export function Sheet({ title, subtitle, children, footer }) {
  const setPopup = useStore((s) => s.setPopup)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setPopup(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPopup])

  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setPopup(null)
      }}
    >
      <div className="sheet">
        <div className="sheet-head">
          <div className="row-main">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="sheet-close pressable" onClick={() => setPopup(null)} aria-label="Close">
            ✕
          </button>
        </div>
        {footer}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
