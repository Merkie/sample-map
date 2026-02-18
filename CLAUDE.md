# Sample Map

Interactive audio sample similarity visualizer. Extracts audio features with Python (librosa), reduces to 2D with t-SNE, then renders an interactive Canvas 2D space scene with d3-force physics. Hover over samples to play them.

## Architecture

```
sample-map/
  server/
    index.ts               # Bun.serve() on port 3720 (API + static files)
    extract.py             # Python: librosa features + t-SNE → JSON
  client/src/              # SolidJS + Canvas 2D (Vite for dev)
    App.tsx                # Canvas + loading/error overlays
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

- Adapted from claude-code-visualizer's Canvas 2D engine
- 4-layer parallax starfield (seeded PRNG, deterministic)
- Sample colors derived from t-SNE position (angle → hue), not folder names
- Glow sizes capped at zoom 1.2 so they don't blow up when zoomed in
- Dynamic camera bounds: zoom-out limited to fit all nodes, pan rubber-bands back to node bounding box

### Physics (d3-force)

- `forceX/Y` pulls toward t-SNE targets (strength 0.12)
- `forceLink` connects k=5 nearest t-SNE neighbors (creates organic sub-clusters)
- `forceManyBody` repulsion varies per node: outliers (fewer neighbors) push harder
- `forceCollide` prevents overlap
- Pre-settles 400 ticks before first render
- All config in `client/src/engine/constants.ts`

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
