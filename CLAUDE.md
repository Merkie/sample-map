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
- `GET /api/presets` — returns user-saved presets JSON array (or `[]` if none)
- `POST /api/presets` — saves a new preset; assigns a generated ID (`preset-{timestamp}-{random}`), appends to `.sample-map-presets.json`, returns the preset with ID

### Caching

- First extraction writes `.sample-map-cache.json` in project root
- User-saved presets are stored in `.sample-map-presets.json` in project root
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

### Zone Classification

Samples are classified into 4 instrument zones: `kick`, `snare`, `hihat`, `perc`. Classification is spatial, not threshold-based:

1. After t-SNE, k-means (k=4) clusters the 2D coordinates
2. KNN smoothing (k=7, majority vote, up to 10 passes) reassigns boundary samples so each zone is spatially contiguous — no stray outliers
3. Bisector reconciliation: recomputes centroids from smoothed labels, then reassigns any node that's closer to another zone's centroid — guarantees every node is on the correct side of the Voronoi bisectors used for rendering
4. Clusters are labeled by average spectral centroid: lowest → kick, next → snare, next → perc, highest → hihat

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
- **Randomize (dice button)**: zone-aware — each track swaps to a random sample from the same zone (kick→kick, hihat→hihat, etc.), falling back to the full pool only if the zone is empty. Accumulates `usedIds` to prevent duplicates across tracks
- **Initial sample pick** (`pickSequencerSamples`): picks one sample from each of the preferred zones `["kick", "snare", "hihat", "perc"]` for the default 4 tracks
- On toggle: sets `engine.bottomMargin` to sequencer height (tracked via `ResizeObserver`) and calls `zoomToFit()`, which animates the camera in sync with the slide
- Canvas stays full-viewport; the camera zooms out and pans up to keep nodes visible above the sequencer
- **Deselection**: clicking on the header bar or sequencer background dismisses the selection ring and disarms any armed track (same as clicking empty canvas space). Header uses `e.target === e.currentTarget` guard so child buttons don't trigger deselection. Interactive sequencer elements (track labels, step cells, transport controls, add-track button) are excluded via `data-seq-interactive` attribute so their own click handlers aren't overridden
- **Duplicate prevention**: clicking a sample already on another track does nothing; arrow-key navigation skips samples on other tracks (`engine.excludeNodeIds`); randomize accumulates `usedIds` so no two tracks share the same sample

### Preset Library

- **Factory presets**: 7 built-in patterns (Four on the Floor, Basic Rock, Hip Hop, Boom Bap, Trap, Reggaeton, Clear) stored as `FACTORY_PRESETS: SavedPreset[]` in Sequencer.tsx. Each has `samplePath: ""` so they always trigger adaptation
- **User presets**: saved via POST to `/api/presets`, persisted in `.sample-map-presets.json`, loaded on startup via GET `/api/presets`
- **SavedPreset interface** (`state.ts`): `{ id, name, bpm, swing, tracks: [{ samplePath, sampleCategory, pattern }] }`
- **Loading flow**: `handleLoadPreset()` checks if all `samplePath` values match loaded nodes. If all match → `applyPreset(preset, false)` (exact). If any missing → shows adaptation modal
- **Adaptation modal** (`App.tsx`): glassmorphism overlay explaining samples will be zone-matched. "Load with My Samples" calls `applyPreset(preset, true)` which picks random nodes from matching zones
- **Save UI**: Save button (lucide `Save` icon) in transport bar opens a dropdown with name input. On save, POSTs to server and appends to `presets` signal
- **Library dropdown**: two sections — "Patterns" (factory presets) and "My Presets" (user presets, shown only when non-empty)

### Debug Panel

- Toggled via "debug" button in header
- Floating draggable panel (drag via header bar)
- Options:
  - **Show zone borders**: renders dashed convex hull borders per zone with color-coded labels (kick=red, snare=blue, hihat=green, perc=yellow). Borders are clipped against Voronoi bisectors (with 8-unit margin for d3-force drift) so zones never overlap.
- State: `debugActive` and `showZoneBorders` signals in `state.ts`; `engine.showZoneBorders` boolean drives rendering

### Audio Playback

- Web Audio API, polyphonic (up to 8 simultaneous voices)
- Samples play to completion — moving across the blob layers sounds
- AudioBuffers cached after first fetch
- Requires user interaction to start (browser AudioContext policy)

### Python Extraction (`server/extract.py`)

- Discovers .wav/.mp3 recursively in samples dir
- Per-file: duration, RMS, ZCR, spectral centroid/bandwidth/rolloff, 13 MFCCs
- StandardScaler normalization → t-SNE (perplexity=min(30, n-1))
- k-means (k=4) on t-SNE coords → KNN smoothing → zone labels
- Outputs JSON with: name, relativePath, category, zone, duration, x, y

## Dependencies

- **Server**: Bun runtime only (no npm deps)
- **Client**: solid-js, d3-force, vite, vite-plugin-solid
- **Python**: librosa, scikit-learn, numpy (in `venv/`)
