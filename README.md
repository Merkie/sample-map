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

## State Management

All singleton/global state lives in `client/src/state.ts` as SolidJS signals — no prop drilling, no context providers. Components import signals directly. See `CLAUDE.md` for rules.

## Sequencer

Click **seq** in the header to open the drum sequencer — it slides up from the bottom while the star map smoothly zooms out and pans up to make room. 16-step grid with 4 tracks: Kick, Snare, Hat, Perc. Includes transport controls (play/stop, BPM, swing). Press **spacebar** to toggle play/pause while the sequencer is open. Swing uses MPC 3000-style timing — even steps stay locked to the grid while odd steps get delayed.

The **randomize** (dice) button swaps each track's sample for a random one from the same zone — kicks stay kicks, hihats stay hihats, etc.

## Zone Classification

Samples are classified into 4 instrument zones: **kick**, **snare**, **hihat**, **perc**. Instead of hand-tuned audio feature thresholds, classification uses spatial clustering on the t-SNE output:

1. t-SNE embeds all 19 audio features (duration, RMS, ZCR, centroid, bandwidth, rolloff, 13 MFCCs) into 2D
2. k-means (k=4) finds natural spatial clusters
3. KNN smoothing (k=7, majority vote) cleans up boundary samples so each zone is spatially contiguous
4. Clusters are labeled by average spectral centroid: lowest → kick, highest → hihat

## Deselection

Click on the header bar, sequencer background, or empty canvas space to dismiss the selection ring and disarm any armed track.

## Debug Panel

Click **debug** in the header to open a draggable floating panel. Options:
- **Show zone borders** — draws dashed convex hull borders around each zone with color-coded labels
