# Sample Map

Interactive audio sample similarity visualizer. Extracts audio features with Python (librosa), reduces to 2D with t-SNE, then renders an interactive Canvas 2D space scene with d3-force physics. Hover over samples to play them.

## Architecture

```
sample-map/
  server/
    index.ts               # Bun.serve() on port 3720 (API + static files)
    extract.py             # Python: librosa features + t-SNE + zone clustering → JSON
  client/src/              # SolidJS + Canvas 2D (Vite for dev)
    state.ts               # Global singleton state (signals for engine, UI, sequencer, debug)
    App.tsx                # Full-viewport canvas + sequencer overlay + debug panel
    Sequencer.tsx          # Drum sequencer UI (FL Studio-style step grid)
    presets.ts             # Factory preset patterns (FACTORY_PRESETS array)
    engine/
      index.ts             # SampleMapEngine — RAF loop, camera, audio playback
      physics.ts           # d3-force sim with neighbor links
      renderer.ts          # Stars, sample dots, zone borders, HUD
      camera.ts            # Free pan/zoom with momentum
      constants.ts         # All tunable values (physics, zoom, rendering)
      types.ts             # SampleNode interface
      utils.ts             # hexToRgb, hslToHex, lerp, clamp
```

## Running

```bash
bun install
bun run dev      # dev with HMR → http://localhost:3721
bun run start    # production build → http://localhost:3720
```

## SolidJS Rules

- **All singleton/global state lives in `client/src/state.ts`** — never create component-local signals for app-wide state
- **Never prop-drill singleton state** — import signals directly from `state.ts` instead of passing through props
- **Props are for per-instance configuration only** — if there's only one source of truth, it belongs in `state.ts`
- **Never destructure props** in SolidJS — it breaks reactivity. Access via `props.x`
- **Components should have zero props when all their data is global** — e.g. `<Sequencer />` takes no props

### State file (`client/src/state.ts`)

Contains all global signals:
- `engine` — SampleMapEngine singleton instance
- `loading`, `error` — app loading/error state
- `sampleCount` — number of loaded samples
- `seqActive` — sequencer panel open/closed
- `seqSamples` — samples assigned to sequencer tracks
- `armedTrack` — which track is armed for sample replacement
- `seqPlaying` — sequencer transport playing/stopped
- `seqBpm`, `seqSwing` — sequencer BPM and swing amount (global for preset save/load)
- `debugActive` — debug panel open/closed
- `showZoneBorders` — toggle zone border rendering
- `physicsEnabled` — toggle d3-force physics on/off (default true)
- `presets` — user-saved presets loaded from server (`SavedPreset[]`)
- `showAdaptModal` — controls the adaptation modal when loading presets with missing samples
- `applyPresetFn` — callback signal set by Sequencer, used by adaptation modal to apply presets

## Key Details

### Server API

- `GET /api/samples` — returns sample JSON array. Query params:
  - `maxDuration=2` (default) — filter to one-shots only. Set to `0` to disable.
  - `excludeLoops=true` (default) — filters out samples with "loop" in the name. Set to `false` to include.
- `GET /api/samples/refresh` — bust cache, re-run Python extraction
- `GET /api/audio/{relativePath}` — serves audio files from `samples/` directory
- User presets are stored in `localStorage` under the key `"sample-map-presets"` (no server API)

### Caching

- First extraction writes `.sample-map-cache.json` in project root
- User-saved presets are stored in `localStorage` (key: `"sample-map-presets"`)
- Subsequent server starts load from cache instantly
- Delete the cache file or hit `/api/samples/refresh` after adding new samples

### Rendering

- Canvas is always full-viewport (`100vw × 100vh`, position absolute); never resizes when sequencer opens
- Header, sequencer, loading/error overlays are all absolutely positioned on top of the canvas
- Adapted from claude-code-visualizer's Canvas 2D engine
- 4-layer parallax starfield (seeded PRNG, deterministic), 2x viewport size centered to avoid visible edges when zoomed out
- Sample colors derived from t-SNE position (angle → hue), not folder names
- Glow sizes capped at zoom 1.2 so they don't blow up when zoomed in
- Dynamic camera bounds: zoom-out limited to fit all nodes, pan rubber-bands back to node bounding box; bounds account for `topMargin`/`bottomMargin`
- `zoomToFit()` called on initial sample load and on sequencer open/close; accounts for `engine.topMargin` (header) and `engine.bottomMargin` (sequencer)
- `zoomToFit()` uses time-based animation (350ms) with `cubic-bezier(0.4, 0, 0.2, 1)` easing, matching the sequencer slide transition
- `engine.resize()` guards against unnecessary canvas clears — only sets `canvas.width`/`canvas.height` when dimensions actually change
- Zone borders (debug): convex hulls per zone, clipped against Voronoi bisectors between zone centroids to prevent overlap

### Physics (d3-force)

- `forceX/Y` pulls toward t-SNE targets (strength 0.12)
- `forceLink` connects k=5 nearest t-SNE neighbors (creates organic sub-clusters)
- `forceManyBody` repulsion varies per node: outliers (fewer neighbors) push harder
- `forceCollide` prevents overlap
- Pre-settles 400 ticks before first render
- All config in `client/src/engine/constants.ts`
- Can be toggled off via debug panel (`physicsEnabled` signal / `engine.setPhysicsEnabled()`); when off, nodes snap to raw t-SNE positions and per-frame ticks are skipped

### Zone Classification

Samples are classified into 4 instrument zones: `kick`, `perc`, `snare`, `hihat`. Classification is spatial, not threshold-based:

1. After t-SNE, k-means (k=4) clusters the 2D coordinates
2. KNN smoothing (k=7, majority vote, up to 10 passes) reassigns boundary samples so each zone is spatially contiguous — no stray outliers
3. Bisector reconciliation: recomputes centroids from smoothed labels, then reassigns any node that's closer to another zone's centroid — guarantees every node is on the correct side of the Voronoi bisectors used for rendering
4. Clusters are labeled by average spectral centroid: lowest → kick, next → perc (tonal hand drums like congas/bongos/cowbells), next → snare (noisy broadband snares/claps), highest → hihat

The `zone` field is included in the JSON output and cached. The `SampleNode` type carries it as `zone: "kick" | "hihat" | "snare" | "perc"`.

### Drum Sequencer

- Toggled via "seq" button in header; slides up from the bottom with a 350ms CSS transition (`cubic-bezier(0.4, 0, 0.2, 1)`)
- Sequencer is always mounted in the DOM (no conditional rendering); hidden via `transform: translateY(100%)`
- FL Studio-style step grid: 16 steps × 4 tracks (Kick, Snare, Hat, Perc)
- Each step is a rounded rectangle with a darkened notch at the top center
- Steps alternate light/dark in groups of 4 (beat grouping)
- Track colors: Kick = indigo (#818cf8), Snare = red (#ef4444), Hat = yellow (#eab308), Perc = green (#22c55e)
- Transport bar: play/stop button (also toggled via spacebar when sequencer is open), BPM number input, swing slider with percentage readout
- Swing uses MPC 3000-style 16ths: even steps (0, 2, 4…) stay locked to the grid, odd steps (1, 3, 5…) get delayed proportionally to the swing amount. 0% = straight, 100% = max delay (~33% of a step duration, roughly triplet feel). Total pair time stays constant so tempo never drifts.
- **Randomize (dice button)**: zone-aware — each track swaps to a random sample from the same zone (kick→kick, hihat→hihat, etc.), falling back to the full pool only if the zone is empty. Accumulates `usedIds` to prevent duplicates across tracks. **Respects track locks** — locked tracks keep their current sample during randomize
- **Track labels**: flex column layout — sample name on top (0.72rem, clickable to arm), grip handle + lock button below. Width 100px for better readability
- **Track locking**: per-track lock button (Lock/LockOpen icons) prevents randomize from changing that track's sample. Lock state is component-local (`lockedTracks` boolean array), NOT saved in presets. Loading a preset resets all locks to unlocked
- **Per-track volume**: vertical fader (20px-wide rotated `<input type="range">`) to the left of each track label. Component-local `trackVolumes` signal (`number[]`, default 1.0 per track). Passed as 3rd arg to `engine.playSample()` which scales gain (`0.6 * volume`). Reordered in parallel with other track arrays on drag. Persisted in presets as `track.volume` (optional, defaults to 1.0 for backward compat). Loading a preset restores volumes; factory presets (no volume field) load at 100%
- **Track reordering**: drag-and-drop via `@thisbeyond/solid-dnd` (`SortableProvider` + `createSortable`). Grip handle (GripVertical icon) indicates drag affordance. On reorder, `seqSamples`, `grid`, `lockedTracks`, and `trackVolumes` arrays are reordered in parallel; armed track index is adjusted
- **Initial sample pick** (`pickSequencerSamples`): picks one sample from each of the preferred zones `["kick", "snare", "hihat", "perc"]` for the default 4 tracks
- On toggle: sets `engine.bottomMargin` to sequencer height (tracked via `ResizeObserver`) and calls `zoomToFit()`, which animates the camera in sync with the slide
- Canvas stays full-viewport; the camera zooms out and pans up to keep nodes visible above the sequencer
- **Deselection**: clicking on the header bar or sequencer background dismisses the selection ring and disarms any armed track (same as clicking empty canvas space). Header uses `e.target === e.currentTarget` guard so child buttons don't trigger deselection. Interactive sequencer elements (track labels, step cells, transport controls, add-track button) are excluded via `data-seq-interactive` attribute so their own click handlers aren't overridden
- **Duplicate prevention**: clicking a sample already on another track does nothing; arrow-key navigation skips samples on other tracks (`engine.excludeNodeIds`); randomize accumulates `usedIds` so no two tracks share the same sample

### Preset Library

- **Factory presets**: 9 built-in patterns stored as `FACTORY_PRESETS: SavedPreset[]` in `presets.ts`. Each has `samplePath: ""` so they always trigger adaptation. Patterns with genre-accurate BPMs:
  - Four on the Floor (120), Basic Rock (120), Hip Hop (90), Boom Bap (90, 45% swing), Trap (140), Dembow Classic (98), Dembow Full (98), Perreo (100), Clear (120)
- **User presets**: saved to `localStorage` (key: `"sample-map-presets"`), loaded on startup
- **SavedPreset interface** (`state.ts`): `{ id, name, bpm, swing, tracks: [{ samplePath, sampleCategory, pattern, volume? }] }`
- **Loading flow**: `handleLoadPreset()` checks if all `samplePath` values match loaded nodes. If all match → `applyPreset(preset, false)` (exact). If any missing → shows adaptation modal
- **Adaptation modal** (`App.tsx`): glassmorphism overlay explaining samples will be zone-matched. "Load with My Samples" calls `applyPreset(preset, true)` which picks zone-matched replacements
- **Sample reuse on load**: when loading a preset (adapt or exact), `applyPreset` tries to reuse the user's current samples before picking random ones. Resolution order: exact path match → current sample from matching zone → random zone pick
- **Save UI**: Save button (lucide `Save` icon) in transport bar opens a dropdown with name input. On save, POSTs to server and appends to `presets` signal
- **Library dropdown**: two sections — "Patterns" (factory presets) and "My Presets" (user presets, shown only when non-empty)

### Debug Panel

- Toggled via "debug" button in header
- Floating draggable panel (drag via header bar)
- Options:
  - **Show zone borders**: renders dashed convex hull borders per zone with color-coded labels (kick=red, snare=blue, hihat=green, perc=yellow). Borders are clipped against Voronoi bisectors (with 8-unit margin for d3-force drift) so zones never overlap.
  - **d3-force physics**: toggle physics post-processing on/off (default on). When off, nodes snap to raw t-SNE positions. When toggled back on, simulation is recreated and pre-settled. Calls `zoomToFit()` on toggle.
  - **Refresh sample cache**: re-runs Python feature extraction and reloads samples into the engine. Equivalent to hitting `/api/samples/refresh`. Shows "Refreshing..." state while working.
- State: `debugActive`, `showZoneBorders`, and `physicsEnabled` signals in `state.ts`; `engine.showZoneBorders` and `engine.physicsEnabled` booleans drive rendering/simulation

### Audio Playback

- Web Audio API, polyphonic (up to 8 simultaneous voices)
- `playSample(node, force?, volume?)` — `volume` (0–1, default 1.0) scales the base gain of 0.6
- Samples play to completion — moving across the blob layers sounds
- AudioBuffers cached after first fetch
- Requires user interaction to start (browser AudioContext policy)

### Python Extraction (`server/extract.py`)

- Discovers .wav/.mp3 recursively in samples dir
- Per-file: 26 features — duration, RMS, ZCR, spectral centroid/bandwidth/rolloff/flatness, 7-band spectral contrast, 13 MFCCs
- Spectral flatness and contrast were added to better separate tonal sounds (whistles, cowbells) from noisy broadband sounds (snares, kicks) — without these, outlier samples like whistles could land near kicks due to matching duration/loudness
- StandardScaler normalization → t-SNE (perplexity=min(30, n-1))
- k-means (k=4) on t-SNE coords → KNN smoothing → zone labels
- Outputs JSON with: name, relativePath, category, zone, duration, x, y

## Dependencies

- **Server**: Bun runtime only (no npm deps, pure Bun APIs — `Bun.serve`, `Bun.file`, `Bun.write`, `Bun.spawn`)
- **Client**: solid-js, d3-force, @thisbeyond/solid-dnd, vite, vite-plugin-solid
- **Python**: librosa, scikit-learn, numpy (in `venv/`)
