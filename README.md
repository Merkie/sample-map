# Sample Map

Interactive audio sample similarity visualizer with a built-in drum sequencer. Extracts audio features with Python (librosa), reduces to 2D with t-SNE, then renders an interactive Canvas 2D space scene with d3-force physics. Hover over samples to play them. Toggle the step sequencer to build patterns.

Samples are automatically classified into instrument zones (kick, snare, hihat, perc) using spatial clustering on the t-SNE output, so the sequencer's randomize button always swaps within the same instrument type.

## Setup

Requires [Bun](https://bun.sh) and Python 3 with a venv:

```bash
bun install
python3 -m venv venv
source venv/bin/activate
pip install librosa scikit-learn numpy
```

Drop your `.wav`/`.mp3` samples into a `samples/` directory.

## Running

```bash
bun run dev      # dev with HMR → http://localhost:3721
bun run start    # production build → http://localhost:3720
```

## API

All routes are under `/api`:

- `GET /api/samples` — sample data as JSON. Query params: `maxDuration=2`, `excludeLoops=true`
- `GET /api/samples/refresh` — bust cache, re-run extraction
- `GET /api/audio/{path}` — serve audio files from `samples/`
- User presets stored in `localStorage` (key: `"sample-map-presets"`)

## State Management

All singleton/global state lives in `client/src/state.ts` as SolidJS signals — no prop drilling, no context providers. Components import signals directly. See `CLAUDE.md` for rules.

## Sequencer

Click **seq** in the header to open the drum sequencer — it slides up from the bottom while the star map smoothly zooms out and pans up to make room. Supports **1–8 bars** (16–128 steps) with a bars input in the transport bar. At 1 bar the steps fill the full width; at 2+ bars the grid scrolls horizontally with track labels pinned to the left. Includes transport controls (play/stop, BPM, bars, swing). Press **spacebar** to toggle play/pause while the sequencer is open (doesn't interfere with text inputs). Swing uses MPC 3000-style timing — even steps stay locked to the grid while odd steps get delayed. The playhead auto-scrolls the grid to stay visible during multi-bar playback.

Each track has a **volume fader** on the left side for per-track mixing. The **randomize** (dice) button swaps each track's sample for a random one from the same zone — kicks stay kicks, hihats stay hihats, etc. **Lock** individual tracks to protect them from randomization — great for locking in samples you like while auditioning alternatives for the rest. **Delete** tracks with the X button — if the track has notes, you'll get a confirmation dialog first.

**Drag-and-drop** tracks to reorder them using the grip handle next to each track label. **Add** new tracks with the + button below the grid.

## Presets

9 factory patterns with genre-accurate BPMs: Four on the Floor, Basic Rock, Hip Hop, Boom Bap (with swing), Trap, Dembow Classic, Dembow Full, Perreo, and Clear. Save your own presets via the save button in the transport bar — per-track volumes and bar count are included in saved presets. When loading a preset, the sequencer tries to keep your current samples if they match the needed zones before picking new ones. Old 16-step presets are automatically padded to the full grid on load.

## Zone Classification

Samples are classified into 4 instrument zones: **kick**, **snare**, **hihat**, **perc**. Instead of hand-tuned audio feature thresholds, classification uses spatial clustering on the t-SNE output:

1. t-SNE embeds 26 audio features (duration, RMS, ZCR, spectral centroid/bandwidth/rolloff/flatness, 7-band spectral contrast, 13 MFCCs) into 2D
2. k-means (k=4) finds natural spatial clusters
3. KNN smoothing (k=7, majority vote) cleans up boundary samples so each zone is spatially contiguous
4. Clusters are labeled by average spectral centroid: lowest → kick, next → perc (tonal hand drums), next → snare (noisy broadband), highest → hihat

## Deselection

Click on the header bar, sequencer background, or empty canvas space to dismiss the selection ring and disarm any armed track.

## Debug Panel

Click **debug** in the header to open a draggable floating panel. Options:
- **Show zone borders** — draws dashed convex hull borders around each zone with color-coded labels
- **d3-force physics** — toggle the d3-force post-processing on/off. When off, samples snap to raw t-SNE positions
- **Refresh sample cache** — re-runs Python feature extraction (equivalent to hitting `/api/samples/refresh`)
