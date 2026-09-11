# Chord Roller

A guitar practice slot machine, built iPad-first. Pull the lever, get a random chord
per reel, and practise them against a strumming pattern and a metronome.

**Live:** https://hamadalsoqaih.github.io/guitar-chord-webapp/

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

## The machine

The slot machine is WebGL (`src/machine/`). The DOM version in `MachineFallback.jsx`
renders instantly, covers the gap while the 3D chunk loads, and stays as the
fallback wherever WebGL2 is unavailable.

**Reels are real cylinders.** The chord pool is repeated around each drum to reach
about 18 cells — wrapping a six-chord pool once would put 60° between neighbours and
stand them on edge. The drum's radius is then derived from the window
(`reelRadius()` in `geometry.js`) so exactly three chords show whatever the pool
size; a fixed radius leaves a sliver of a fourth.

**Spins are decided first, animated second.** `spin()` picks each result, then
`rotationForCell()` solves the rotation backwards from it. A drum cannot stop
anywhere but on the chosen chord.

**The glass** (`ReelGlass.jsx`) is a custom shader rather than
`MeshTransmissionMaterial`, which re-renders the whole scene into a buffer that has
to be near canvas resolution or the chords behind it turn to mush. This one refracts
only what is actually behind the pane — drums, win lines, back panel — selected by
layer, so it stays sharp for a fraction of the cost.

**The glow** is additive geometry, not a bloom pass. Post-processing writes an opaque
frame, which paints a rectangle over the page wherever the canvas should be
transparent; every emitter here is small enough to carry its own halo.

**The WebGL context is created once and kept.** The practice page is hidden, not
unmounted, while settings is open: a browser keeps only a handful of contexts alive
and starts dropping the oldest, which is how a machine turns into a blank rectangle
— or, once the probe for WebGL2 support starts failing, into the DOM machine for the
rest of the session. Nothing renders while it is hidden, the context probe hands its
own context straight back, and if a context is lost anyway the DOM machine takes
over until the browser restores it.

**Framing** reserves room for the push. The pull dollies the camera in, which
magnifies everything in frame, and the fit has to account for the cabinet's own
depth — its front face is half a unit nearer than the plane the fit is solved for,
worth about eight per cent on its own. `npm run test:framing` projects the machine's
silhouette and asserts it never leaves the canvas, at both orientations and at three
and six reels; the touch suite checks the same thing through a whole pull.

**Coplanar surfaces are a bug, not a shortcut.** The neon stood flush against its
housing, so the depth test decided per pixel which of the two was in front and the
sign came out patched with rectangles of bare metal and a ghost of itself — only on
some devices, and only while the camera moved. The tubes now stand off the board,
the way real neon does.

## Performance

Measured with `window.__r3fInfo` (draw calls per frame, whole frame including the
refraction pass):

| | idle | spinning |
|---|---|---|
| 3 reels | 26 / 34 | 26 / 34 |
| 6 reels | 29 / 40 | 29 / 40 |

Two numbers because most frames skip the refraction pass: the lower one is a frame
that reused the buffer, the higher one a frame that redrew it. Flat under load,
which is the point. Getting there meant caching `poolOf()` so it
returns a stable reference — as a zustand selector, a fresh array each call
re-rendered every subscriber ten times a second during a spin and sent the
environment probe back to re-bake — dropping the real-time shadow map in favour of a
contact shadow baked on frame one, and swapping the drum's blur texture without
forcing a shader rebuild.

**Nothing is drawn that nobody asked for.** The scene renders on demand: anything
that starts a motion — a pull, a roll, a drag, the beat, the idle sway — says so
(`activity.js`), and the frame governor asks for every frame the device will give
until that settles, then drops to 20-30fps, which is all a lamp chase needs. The
refraction buffer goes further and is only redrawn when the drums or the camera have
actually moved, with a twice-a-second heartbeat as insurance against a change the
cheap test cannot see. An idle machine costs a fraction of a busy one.

**Quality tiers** (`quality.js`) set the pixels, never the parts: the cabinet, the
curved glass, the lamps and the neon are identical on every device. What changes is
the device pixel ratio, the size of the refraction buffer, the printed strip's
resolution (it is several thousand pixels wide, so this is the difference between
thirty megabytes of texture and eight), multisampling, the chromatic fringe in the
glass, and the frosted card in the page below. The tier is a starting guess from the
device's cores, memory and screen; `PerformanceMonitor` still walks the resolution
down from there if the guess was optimistic, and rendering stops entirely when the
tab is hidden. `?quality=low|medium|high` forces a tier for testing.

On the software rasteriser the tests run on, the low tier renders an idle frame
about five times faster than the high one, and the two are hard to tell apart in a
screenshot.

## Touch

Built for fingers: pointer capture with per-pointer locking so a second finger can't
hijack a drag, 44pt targets, no hover-only affordances, and the iOS specifics that
silently break otherwise — the audio context unlocked from a real gesture, the video
`muted` + `playsinline`, safe-area insets on the nav and the character floor.

`npm test` drives the app through real touch events at both iPad orientations,
including two-finger reel scrubbing and a stray second finger during a lever pull.

## Assets

The character files carry embedded provenance metadata from the tool that produced
them. `scripts/strip-provenance.mjs` removes it — run it after replacing any asset,
or `--check` to see what is still in there. PNGs lose only metadata chunks, so the
pixels are untouched; the MP4's metadata boxes are retyped to `free` and zeroed
rather than cut out, because its sample tables address `mdat` by absolute file
offset and removing bytes ahead of it would break playback.

## Characters

Coco is filmed on black; `src/coco/videoMatte.js` lifts him off that background at
runtime so he can stand anywhere on the page. If the clip can't play, it falls back
to the still portrait through the same matte. The pixel character is a two-frame
sprite. Both are draggable, fall when released, and remember where they were left —
and dropping either one on the lever pulls it.
