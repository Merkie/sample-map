# Sample Map

Interactive audio sample similarity visualizer. Extracts audio features with Python (librosa), reduces to 2D with t-SNE, then renders an interactive Canvas 2D space scene with d3-force physics. Hover over samples to play them.

## Architecture

```
sample-map/
  server/
    index.ts               # Bun.serve() on port 3720 (API + static files)
    extract.py             # Python: librosa features + t-SNE → JSON
  client/src/              # SolidJS + Canvas 2D (Vite for dev)
    App.tsx                # Full-viewport canvas + sequencer overlay
    Sequencer.tsx          # Drum sequencer UI (FL Studio-style step grid)
    engine/
      index.ts             # SampleMapEngine — RAF loop, camera, audio playback
      physics.ts           # d3-force sim with neighbor links
      renderer.ts          # Stars, sample dots, HUD
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

## Key Details

### Server API

- `GET /api/samples` — returns sample JSON array. Query params:
  - `maxDuration=2` (default) — filter to one-shots only. Set to `0` to disable.
  - `excludeLoops=true` (default) — filters out samples with "loop" in the name. Set to `false` to include.
- `GET /api/samples/refresh` — bust cache, re-run Python extraction
- `GET /api/audio/{relativePath}` — serves audio files from `samples/` directory

### Caching

- First extraction writes `.sample-map-cache.json` in project root
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

### Physics (d3-force)

- `forceX/Y` pulls toward t-SNE targets (strength 0.12)
- `forceLink` connects k=5 nearest t-SNE neighbors (creates organic sub-clusters)
- `forceManyBody` repulsion varies per node: outliers (fewer neighbors) push harder
- `forceCollide` prevents overlap
- Pre-settles 400 ticks before first render
- All config in `client/src/engine/constants.ts`

### Drum Sequencer

- Toggled via "seq" button in header; slides up from the bottom with a 350ms CSS transition (`cubic-bezier(0.4, 0, 0.2, 1)`)
- Sequencer is always mounted in the DOM (no conditional rendering); hidden via `transform: translateY(100%)`
- FL Studio-style step grid: 16 steps × 4 tracks (Kick, Snare, Hat, Perc)
- Each step is a rounded rectangle with a darkened notch at the top center
- Steps alternate light/dark in groups of 4 (beat grouping)
- Track colors: Kick = indigo (#818cf8), Snare = red (#ef4444), Hat = yellow (#eab308), Perc = green (#22c55e)
- Transport bar: play/stop button, BPM number input, swing slider with percentage readout
- UI only for now — no audio scheduling yet
- On toggle: sets `engine.bottomMargin` to sequencer height (tracked via `ResizeObserver`) and calls `zoomToFit()`, which animates the camera in sync with the slide
- Canvas stays full-viewport; the camera zooms out and pans up to keep nodes visible above the sequencer

### Audio Playback

- Web Audio API, polyphonic (up to 8 simultaneous voices)
- Samples play to completion — moving across the blob layers sounds
- AudioBuffers cached after first fetch
- Requires user interaction to start (browser AudioContext policy)

### Python Extraction (`server/extract.py`)

- Discovers .wav/.mp3 recursively in samples dir
- Per-file: duration, RMS, ZCR, spectral centroid/bandwidth/rolloff, 13 MFCCs
- StandardScaler normalization → t-SNE (perplexity=min(30, n-1))
- Outputs JSON with: name, relativePath, category, duration, x, y

## Dependencies

- **Server**: Bun runtime only (no npm deps)
- **Client**: solid-js, d3-force, vite, vite-plugin-solid
- **Python**: librosa, scikit-learn, numpy (in `venv/`)
