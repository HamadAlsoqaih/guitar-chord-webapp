import { useState } from 'react'
import { CHAR_SIZE_MAX, CHAR_SIZE_MIN, CHAR_SIZE_STEP } from '../store/defaults.js'
import { useStore } from '../store/useStore.js'
import { Sheet } from './Sheet.jsx'

const MOODS = [
  { key: 'sayTaps', ar: 'عند الضغط', en: 'pressed' },
  { key: 'sayDrags', ar: 'عند السحب', en: 'dragged' },
  { key: 'sayFalls', ar: 'عند الوقوع', en: 'fell' },
]

const MODES = [
  { key: 'video', label: 'Coco' },
  { key: 'pixel', label: 'Chibi Coco' },
  { key: 'both', label: 'Both' },
]

export function CocoSheet() {
  const charMode = useStore((s) => s.charMode)
  const charSize = useStore((s) => s.charSize)
  const setCharMode = useStore((s) => s.setCharMode)
  const setCharSize = useStore((s) => s.setCharSize)
  const addLine = useStore((s) => s.addLine)
  const toggleLine = useStore((s) => s.toggleLine)
  const removeLine = useStore((s) => s.removeLine)

  const [mood, setMood] = useState('sayTaps')
  const [draft, setDraft] = useState('')
  const lines = useStore((s) => s[mood])

  const submit = () => {
    addLine(mood, draft)
    setDraft('')
  }

  return (
    <Sheet title="كوكو · Coco" subtitle="He picks a checked line at random">
      <div className="sheet-label">الشخصية · character on screen</div>
      <div className="seg">
        {MODES.map((m) => (
          <button key={m.key} data-active={charMode === m.key} onClick={() => setCharMode(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="row" style={{ padding: '4px 0' }}>
        <div className="row-main">
          <div className="sheet-label">الحجم · size</div>
        </div>
        <div className="stepper">
          <button className="step-btn pressable" onClick={() => setCharSize(charSize - CHAR_SIZE_STEP)} aria-label="Smaller">
            −
          </button>
          <div className="step-value" style={{ display: 'grid', placeItems: 'center' }}>
            {charSize}%
          </div>
          <button className="step-btn pressable" onClick={() => setCharSize(charSize + CHAR_SIZE_STEP)} aria-label="Bigger">
            +
          </button>
        </div>
      </div>
      <input
        type="range"
        min={CHAR_SIZE_MIN}
        max={CHAR_SIZE_MAX}
        step={CHAR_SIZE_STEP}
        value={charSize}
        onChange={(e) => setCharSize(Number(e.target.value))}
        aria-label="Character size"
        style={{ width: '100%' }}
      />

      <div className="seg">
        {MOODS.map((m) => (
          <button key={m.key} data-active={mood === m.key} onClick={() => setMood(m.key)}>
            {m.ar} · {m.en}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <input
          className="field rtl"
          value={draft}
          placeholder="اكتب جملة جديده"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label="New line"
        />
        <button className="btn" onClick={submit}>
          Add
        </button>
      </div>

      {lines.map((line, i) => (
        <div className="list-item" key={i}>
          <span className="list-name rtl" style={{ fontSize: 15, fontWeight: 600 }}>
            {line.text}
          </span>
          <button className="icon-x pressable" onClick={() => removeLine(mood, i)} aria-label="Remove line">
            ✕
          </button>
          <button
            className="check pressable"
            data-on={line.on}
            onClick={() => toggleLine(mood, i)}
            role="checkbox"
            aria-checked={line.on}
            aria-label="Line enabled"
          >
            ✓
          </button>
        </div>
      ))}
    </Sheet>
  )
}
