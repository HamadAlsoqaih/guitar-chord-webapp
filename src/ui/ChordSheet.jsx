import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { Sheet } from './Sheet.jsx'

/** Anything ending in "m" (but not just "m") reads as a minor chord. */
const quality = (name) => (/^[A-Ga-g][#b]?m/.test(name.trim()) ? 'minor' : 'major')

export function ChordSheet({ listKey }) {
  const list = useStore((s) => s[listKey])
  const addChord = useStore((s) => s.addChord)
  const toggleChord = useStore((s) => s.toggleChord)
  const removeChord = useStore((s) => s.removeChord)
  const [draft, setDraft] = useState('')

  const submit = () => {
    addChord(listKey, draft)
    setDraft('')
  }

  return (
    <Sheet
      title={listKey === 'learn' ? 'Chords to learn' : 'Chords you know'}
      subtitle="A letter alone is major · add m for minor (Am)"
      footer={
        <div className="add-row">
          <input
            className="field"
            value={draft}
            placeholder="Add a chord — e.g. G or Em"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            aria-label="New chord name"
          />
          <button className="btn" onClick={submit}>
            Add
          </button>
        </div>
      }
    >
      {list.map((chord, i) => (
        <div className="list-item" key={`${chord.name}-${i}`}>
          <span className="list-name">{chord.name}</span>
          <span className="list-tag">{quality(chord.name)}</span>
          <button className="icon-x pressable" onClick={() => removeChord(listKey, i)} aria-label={`Remove ${chord.name}`}>
            ✕
          </button>
          <button
            className="check pressable"
            data-on={chord.on}
            onClick={() => toggleChord(listKey, i)}
            role="checkbox"
            aria-checked={chord.on}
            aria-label={`${chord.name} in the machine`}
          >
            ✓
          </button>
        </div>
      ))}
      {list.length === 0 && <p className="sheet-label">No chords yet — add one above.</p>}
    </Sheet>
  )
}
