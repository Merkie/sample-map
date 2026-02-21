# Sample Map

[![SolidJS](https://img.shields.io/badge/SolidJS-2c4f7c?logo=solid&logoColor=white)](https://www.solidjs.com/)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)](https://bun.sh)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://python.org)
[![Canvas 2D](https://img.shields.io/badge/Canvas_2D-FF6600?logo=html5&logoColor=white)](#)
[![d3-force](https://img.shields.io/badge/d3--force-F9A03C?logo=d3dotjs&logoColor=white)](https://d3js.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Drop in a folder of drum samples and Sample Map will analyze their sonic characteristics, arrange them in 2D space by similarity, and classify them into instrument zones — all rendered as an interactive star-field you can explore, audition, and sequence.

**[Try the live demo](https://samplemap.archers.tools)** — a hosted version loaded with classic drum machine samples from the 80s and 90s. Browse, audition, and sequence everything. (Uploading your own samples requires running locally.)

<p align="center">
  <img src="https://github.com/user-attachments/assets/afae0b16-6703-43bb-a2e2-6224da2f2cd0" alt="Exploring the sample map with arrow key traversal" width="720" />
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/4838ab3a-c609-42f9-b86c-5c81048b4984" alt="Building a beat in the drum sequencer" width="720" />
</p>

---

## How It Works

### 1. Feature Extraction

Point Sample Map at a directory of `.wav` or `.mp3` files. A Python pipeline (librosa + scikit-learn) discovers every audio file recursively and extracts **26 audio features** from each one:

- **Duration** and **RMS loudness**
- **Zero-crossing rate**
- **Spectral centroid**, **bandwidth**, **rolloff**, and **flatness**
- **7-band spectral contrast** — helps separate tonal sounds (cowbells, congas) from noisy broadband sounds (snares, claps)
- **13 MFCCs** — compact representation of timbral texture

By default, samples longer than 2 seconds are filtered out so the map focuses on one-shots rather than loops.

### 2. Dimensionality Reduction (t-SNE)

The 26-dimensional feature vectors are normalized with `StandardScaler` and then compressed to 2D coordinates using **t-SNE** (t-distributed Stochastic Neighbor Embedding). Samples that sound similar end up close together — kicks cluster near other kicks, hi-hats near other hi-hats, and so on.

The t-SNE output is also rotated so its principal axis of variance aligns horizontally, making better use of widescreen displays.

<p align="center">
  <img src="YOUR_TSNE_IMAGE_URL" alt="Raw t-SNE positions before d3-force physics" width="600" />
  <br />
  <em>Raw t-SNE coordinates before physics are applied</em>
</p>

### 3. Zone Classification

After t-SNE, samples are classified into **4 instrument zones**: kick, perc, snare, and hi-hat. The classification is entirely spatial — no hand-tuned audio thresholds:

1. **k-means** (k=4) clusters the 2D coordinates
2. **KNN smoothing** (k=7, majority vote, up to 10 passes) cleans up boundary samples so each zone is spatially contiguous with no stray outliers
3. **Bisector reconciliation** recomputes centroids and reassigns any sample that ended up on the wrong side of a zone boundary
4. Clusters are **labeled by average spectral centroid**: lowest frequency content → kick, then perc (tonal hand drums like congas and bongos), then snare (noisy broadband), highest → hi-hat

<p align="center">
  <img src="YOUR_ZONES_IMAGE_URL" alt="Samples classified into kick, perc, snare, and hi-hat zones" width="600" />
  <br />
  <em>Zone borders visible with the debug panel — kick (red), perc (yellow), snare (blue), hi-hat (green)</em>
</p>

### 4. Physics Simulation (d3-force)

Once the server sends the t-SNE coordinates to the client, a **d3-force** simulation adds organic structure:

- **Position forces** gently pull each sample toward its t-SNE target
- **Neighbor links** connect each sample to its 5 nearest t-SNE neighbors, forming natural sub-clusters
- **Many-body repulsion** prevents pileups (outlier samples with fewer neighbors push harder)
- **Collision forces** keep dots from overlapping

The simulation pre-settles 400 ticks before the first render so you never see samples flying into place. Physics can be toggled off from the debug panel to see the raw t-SNE positions.

### 5. Rendering

Everything is drawn on a full-viewport HTML Canvas with a space-themed aesthetic:

- **4-layer parallax starfield** with deterministic seeded PRNG and twinkling
- **Colored sample dots** — each sample's color is derived from its t-SNE position (angle from center → hue, distance from center → saturation/lightness), creating a natural rainbow gradient across the map
- **Glow effects** on hover and playback
- **Animated selection ring** with spring physics for navigating between samples
- **Free pan and zoom** with momentum and rubber-banding at bounds

---

## Controls

| Input | Action |
|---|---|
| **Hover** | Preview a sample (plays the audio) |
| **Click** | Select a sample (locks the selection ring) |
| **Arrow keys** | Traverse to the nearest neighbor in that direction — the camera follows |
| **Scroll wheel** | Zoom in/out (focal-point zoom) |
| **Click + drag** | Pan the camera (with momentum) |
| **Pinch** | Zoom on touch devices |
| **Spacebar** | Play/pause sequencer (when open) |
| **Escape** | Dismiss selection |

Arrow key traversal uses a directional cone — it finds the closest sample in roughly the direction you pressed, weighted toward proximity over exact alignment. When the sequencer is open, traversal skips samples already assigned to other tracks to avoid duplicates.

---

## Drum Sequencer

Click **seq** in the header to open the step sequencer. The star map smoothly zooms out and pans up to make room as the sequencer slides in from the bottom.

### Step Grid
- FL Studio-style step grid with up to **8 bars** (128 steps)
- Default 4 tracks: Kick, Snare, Hi-Hat, Perc — each automatically zone-matched from your sample pool
- Steps are color-coded by track with beat-grouping shading (alternating light/dark every 4 steps)
- At 1 bar, steps fill the full width; at 2+ bars, the grid scrolls horizontally with track labels pinned to the left
- The playhead auto-scrolls during multi-bar playback

### Transport
- **Play/Stop** — also toggled with spacebar
- **BPM** — adjustable tempo
- **Bars** — 1 to 8 bars
- **Swing** — MPC 3000-style 16th-note swing. Even steps stay locked to the grid while odd steps get delayed proportionally. At 0% it's straight; cranked up it approaches a triplet feel. Total pair timing is preserved so the tempo never drifts.

### Track Features
- **Volume fader** — per-track vertical fader for mixing
- **Arm track** — click a track name to arm it, then click any sample on the map to assign it
- **Randomize** (dice button) — swaps each track's sample for a random one from the same zone. Kicks stay kicks, hi-hats stay hi-hats. Respects track locks and prevents duplicates across tracks
- **Lock** — protect individual tracks from randomization. Lock in the samples you like, then roll the dice for the rest
- **Scatter mode** — per-track toggle with adjustable radius. When enabled, each step randomly picks a nearby neighbor sample instead of always playing the same one, adding organic variation. Every playback and export is a unique take
- **Delete** — remove a track (confirms first if the track has notes)
- **Add track** — add new tracks with the + button
- **Drag to reorder** — grip handle on each track for drag-and-drop reordering

### Assigning Samples
Click a sample on the map while a track is armed to assign it. Arrow-key traversal respects the sequencer — samples already on other tracks are skipped so you can navigate freely without hitting duplicates.

---

## Presets

### Factory Presets
16 built-in genre patterns ready to go:
- **Hip Hop** (90 BPM), **Boom Bap** (90 BPM, 45% swing), **Trap** (140 BPM)
- **Afrobeat** — 6 variations (95–113 BPM)
- **Dembow**, **Reggaeton**, **Perreo** — 6 Latin rhythm variations (92–100 BPM)
- **Clear** — empty grid reset

Factory presets adapt to whatever samples you have loaded — each track gets zone-matched to the closest available sample.

### Saving & Loading
- **Save** your own presets with a custom name via the save button in the transport bar
- Presets store BPM, swing, bar count, step patterns, per-track volumes, and scatter settings
- **User presets** are saved to `localStorage` and persist across sessions
- When loading a preset, the sequencer tries to reuse your current samples first (exact path match → same zone match → random zone pick)
- Old 16-step presets are automatically padded to the full 128-step grid

---

## MP3 Export

Click the **download** button in the transport bar to export your beat. The full loop is rendered offline via `OfflineAudioContext` and encoded to **192kbps MP3** using lamejs. All settings are baked in: BPM, swing, per-track volumes, and scatter. Scatter-enabled tracks pick a random neighbor for each step, so every export is a unique take. Downloads as `sample-map-{bpm}bpm.mp3`.

---

## Setup

Requires [Bun](https://bun.sh) and Python 3.

```bash
# Install JS dependencies
bun install

# Set up Python environment
python3 -m venv venv
source venv/bin/activate
pip install librosa scikit-learn numpy
```

Drop your `.wav` / `.mp3` samples into a `samples/` directory at the project root.

```bash
# Development (with HMR)
bun run dev        # → http://localhost:3721

# Production build
bun run start      # → http://localhost:3720
```

On first launch, the server runs the Python extraction pipeline and caches the results to `.sample-map-cache.json`. Subsequent starts load from cache instantly. Delete the cache file after adding new samples to trigger re-extraction.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Server** | [Bun](https://bun.sh) — no npm dependencies, pure Bun APIs |
| **Client** | [SolidJS](https://www.solidjs.com/) + HTML Canvas 2D + [Vite](https://vite.dev/) |
| **Physics** | [d3-force](https://d3js.org/d3-force) |
| **Analysis** | Python — [librosa](https://librosa.org/), [scikit-learn](https://scikit-learn.org/), [NumPy](https://numpy.org/) |
| **Audio** | Web Audio API (polyphonic, up to 8 simultaneous voices) |
| **Export** | [lamejs](https://github.com/zhuker/lamejs) (MP3 encoding) |
| **Drag & Drop** | [@thisbeyond/solid-dnd](https://github.com/thisbeyond/solid-dnd) |
