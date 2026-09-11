import { useState } from 'react'
import { CELLS_PER_PATTERN, CELL_LABELS, SYM } from '../store/defaults.js'
import { useStore } from '../store/useStore.js'
import { Sheet } from './Sheet.jsx'

const EMPTY = () => ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R']
const glyphs = (cells) => cells.map((c) => SYM[c]).join(' ')

export function PatternSheet() {
  const patterns = useStore((s) => s.patterns)
  const addPattern = useStore((s) => s.addPattern)
  const togglePattern = useStore((s) => s.togglePattern)
  const removePattern = useStore((s) => s.removePattern)
  const [draft, setDraft] = useState(EMPTY)
  const [cursor, setCursor] = useState(0)

  /** Tapping a symbol fills the selected slot and advances, so you can type a bar straight through. */
  const fill = (value) => {
    setDraft((d) => {
      const next = d.slice()
      next[cursor] = value
      return next
    })
    setCursor((c) => (c + 1) % CELLS_PER_PATTERN)
  }

  const randomise = () => {
    const pick = () => ['D', 'U', 'R'][Math.floor(Math.random() * 3)]
    const next = Array.from({ length: CELLS_PER_PATTERN }, pick)
    if (next.every((c) => c === 'R')) next[0] = 'D'
    setDraft(next)
    setCursor(0)
  }

  const save = () => {
    addPattern(draft)
    setDraft(EMPTY())
    setCursor(0)
  }

  return (
    <Sheet title="Strumming patterns" subtitle="Tap a slot, then ↑ ↓ or –. Checked patterns go in rotation.">
      <div className="editor">
        <div className="grid8">
          {draft.map((cell, i) => (
            <div className="cell" key={i}>
              <button
                className="cell-box"
                data-cursor={i === cursor}
                data-rest={cell === 'R'}
                onClick={() => setCursor(i)}
                aria-label={`Slot ${CELL_LABELS[i]}`}
              >
                {SYM[cell]}
              </button>
              <div className="cell-label">{CELL_LABELS[i]}</div>
            </div>
          ))}
        </div>
        <div className="seg">
          <button onClick={() => fill('D')}>↓</button>
          <button onClick={() => fill('U')}>↑</button>
          <button onClick={() => fill('R')}>–</button>
          <button onClick={randomise}>⤨ Random</button>
          <button className="btn" onClick={save}>
            Add
          </button>
        </div>
      </div>

      {patterns.map((p, i) => (
        <div className="list-item" key={i}>
          <span className="pattern-glyphs">{glyphs(p.cells)}</span>
          <button className="icon-x pressable" onClick={() => removePattern(i)} aria-label="Remove pattern">
            ✕
          </button>
          <button
            className="check pressable"
            data-on={p.on}
            onClick={() => togglePattern(i)}
            role="checkbox"
            aria-checked={p.on}
            aria-label="Pattern in rotation"
          >
            ✓
          </button>
        </div>
      ))}
    </Sheet>
  )
}

/** The ▾ next to STRUM: choose which pattern is showing right now. */
export function PatternPicker() {
  const patterns = useStore((s) => s.patterns)
  const patternIdx = useStore((s) => s.patternIdx)
  const selectPattern = useStore((s) => s.selectPattern)

  return (
    <Sheet title="Choose a pattern" subtitle="Tap one to load it into the strum card.">
      {patterns.map((p, i) => (
        <button
          className="list-item pressable"
          key={i}
          onClick={() => selectPattern(i)}
          style={i === patternIdx ? { borderColor: 'var(--blue)' } : undefined}
        >
          <span className="pattern-glyphs">{glyphs(p.cells)}</span>
          <span className="check" data-on={i === patternIdx}>
            ✓
          </span>
        </button>
      ))}
    </Sheet>
  )
}
