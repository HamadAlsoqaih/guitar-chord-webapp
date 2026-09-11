# Chord Roller

A guitar practice slot machine, built iPad-first. Pull the lever, get a random chord
per reel, and practise them against a strumming pattern and a metronome.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run dev` binds to every interface, so you can open it on an iPad on the same
network at `http://<your-computer-ip>:5173`.

```bash
npm run build && npm run preview   # production bundle
npm test                           # touch-driven browser suite
```

## How it works

Two clocks run, and they are deliberately independent:

- **The reels** use fixed slot-machine timing — reel `i` stops at `1200 + i * 500` ms.
  Tempo does not affect them.
- **BPM** drives only the metronome and the strum grid highlight.

Everything tunable lives in `src/store/defaults.js`. Settings persist to
`localStorage` under `chord-roller-v1`.

## Layout

The machine is centred between the top of the screen and the top of the nav bar; the
strum card is centred between the machine's bottom edge and the nav. Both are
recomputed on every resize in `src/layout/useLayout.js` and published as CSS custom
properties.

## Characters

Coco is filmed on black; `src/coco/videoMatte.js` lifts him off that background at
runtime so he can stand anywhere on the page. If the clip can't play, it falls back
to the still portrait through the same matte. The pixel character is a two-frame
sprite. Both are draggable, fall when released, and remember where they were left.
