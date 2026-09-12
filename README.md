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

**Only the chord on the payline keeps its colour.** The two above and below it are
drained to grey in the drum's own shader, from each fragment's height above the
drum's centre — which is the payline — against the same half-arc the red lines
bracket. A printed strip could not do this: the drum turns, so which cell is on the
line changes every frame.

**The WebGL context is created once and kept.** The practice page is hidden, not
unmounted, while settings is open: a browser keeps only a handful of contexts alive
and starts dropping the oldest, which is how a machine turns into a blank rectangle
— or, once the probe for WebGL2 support starts failing, into the DOM machine for the
rest of the session. Nothing renders while it is hidden, the context probe hands its
own context straight back, and if a context is lost anyway the DOM machine takes
over until the browser restores it.

**Tilt** is measured against the screen, not the device. `gamma` and `beta` are
device axes, so on a tablet held in landscape they have swapped over: tilting it
sideways moves `beta`, and the code was watching `gamma` — which is why "tilt with
the iPad" appeared to do nothing. The pair is rotated by the screen's own angle, and
the first reading taken as level, so it leans from however the tablet is being held.
`npm run test:tilt` checks that mapping on its own — it is pure arithmetic, and
needs neither a browser nor a gyroscope.

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

## Sound

The machine is synthesised, not sampled — `src/audio/engine.js`, the same Web Audio
graph the metronome runs on. A sample would have to be recorded at one speed and
then played at that speed, and a roll changes speed the whole way through; building
the sound out of the mechanism instead means it is right at every point of the
run-down, at any reel count, however long the roll lasts.

A tick fires for each chord that crosses the payline, so the rattle speeds up and
thins out exactly as the drums do. The ticks are booked on the audio clock across
the frame they belong to rather than played one per frame — at full speed a drum
passes several chords between two frames, and playing one of them would make the
rattle a report of the frame rate. All the drums share one gate: three reels running
is one machine rattling, not three, and without it the fast part of a roll is a tone
rather than the sound of something turning.

Each drum lands with a detent thump and a bell — inharmonic partials, because struck
metal is not harmonic — a step higher than the drum before it, so a roll finishes on
a rising figure.

`npm run test:audio` taps the audio graph: it records every voice as it is scheduled
and watches every sample that reaches the speakers, which is how the rattle, the
three bells and their rising pitches are checked without anyone listening.

## Loading and caching

The first visit shows a skeleton in the machine's place — the same proportions, so
nothing moves when the real one arrives. It used to show the DOM machine, which
meant the app opened on the flat version and swapped it for the 3D one a moment
later: a visible downgrade for anyone who had seen the real thing. The DOM machine
is still there for the case it was written for — no WebGL, or a context the browser
took away — where it is a working machine rather than a placeholder.

A service worker (`public/sw.js`) makes the second visit instant and an offline one
possible. Assets are served cache-first, since the build content-hashes their names
and a deploy produces new ones; everything else, the page above all, is
network-first, because the page is what names the current asset filenames and a
stale copy of it would pin the whole app to an old version. The first visit finishes
before the worker exists, so none of its downloads went through it — the page
reports what it actually loaded and the worker stores that, which needs no generated
manifest kept in step with the build. Lookups ignore `Vary`: these responses carry
`Vary: Origin` while the page's own module scripts are fetched with `crossorigin`,
and the two never matched, leaving a cache that was full and useless.

`npm run test:offline` cuts the network and reloads to prove the app still opens.

**Changing CSS without guessing.** `npm run test:styles <file.json>` walks every
element on twenty-six screens — both themes, both orientations, two to six reels,
the settings page, each sheet, the loading skeleton and the DOM machine — and
records its box and its resolved styles, plus every design token. Take one before a
stylesheet change and one after: a deletion of rules nothing uses has to produce an
identical file, and any line that differs names the element and the property that
actually depended on the rule. Anything that animates is left out so two runs of an
unchanged app agree exactly, which is worth checking first — an instrument that is
not stable against itself proves nothing.

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
