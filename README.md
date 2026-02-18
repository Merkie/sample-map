# Sample Map

Interactive audio sample similarity visualizer with a built-in drum sequencer. Extracts audio features with Python (librosa), reduces to 2D with t-SNE, then renders an interactive Canvas 2D space scene with d3-force physics. Hover over samples to play them. Toggle the step sequencer to build patterns.

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

## Sequencer

Click **seq** in the header to open the drum sequencer at the bottom of the screen. 16-step grid with 4 tracks: Kick, Snare, Hat, Perc. Includes transport controls (play/stop, BPM, swing). UI only for now — audio scheduling coming soon.
