#!/usr/bin/env python3
"""Extract audio features + t-SNE coords, output JSON to stdout."""

import json
import os
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import librosa
from sklearn.preprocessing import StandardScaler
from sklearn.manifold import TSNE

warnings.filterwarnings("ignore")

AUDIO_EXTENSIONS = {".wav", ".mp3"}


def discover_samples(root: Path) -> list[dict]:
    samples = []
    for dirpath, _, filenames in os.walk(root):
        for fname in filenames:
            fpath = Path(dirpath) / fname
            if ".asd" in fpath.suffixes:
                continue
            if fpath.suffix.lower() in AUDIO_EXTENSIONS:
                parts = Path(dirpath).relative_to(root).parts
                samples.append({
                    "name": fpath.stem,
                    "path": str(fpath),
                    "relativePath": str(fpath.relative_to(root)),
                    "category": parts[-1] if parts else "uncategorized",
                })
    return samples


def extract_features(filepath: str) -> list[float] | None:
    try:
        y, sr = librosa.load(filepath, sr=22050, mono=True)
    except Exception:
        return None

    duration = librosa.get_duration(y=y, sr=sr)
    rms = float(np.mean(librosa.feature.rms(y=y)[0]))
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y)[0]))
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)[0]))
    bandwidth = float(np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]))
    rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr)[0]))
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_means = [float(np.mean(mfccs[i])) for i in range(13)]

    return [duration, rms, zcr, centroid, bandwidth, rolloff] + mfcc_means


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "samples"

    samples = discover_samples(root)
    print(f"Found {len(samples)} samples", file=sys.stderr)

    valid = []
    rows = []
    extract_start = time.perf_counter()
    for i, s in enumerate(samples):
        t0 = time.perf_counter()
        feat = extract_features(s["path"])
        dt = time.perf_counter() - t0
        if feat is None:
            print(f"  [{i+1}/{len(samples)}] {s['name']} — skipped ({dt:.0f}ms)", file=sys.stderr)
            continue
        s["duration"] = feat[0]  # first feature is duration
        valid.append(s)
        rows.append(feat)
        print(f"  [{i+1}/{len(samples)}] {s['name']} ({dt*1000:.0f}ms)", file=sys.stderr)
    extract_elapsed = time.perf_counter() - extract_start
    print(f"\nFeature extraction: {extract_elapsed:.2f}s total, {extract_elapsed/len(samples)*1000:.0f}ms/sample avg", file=sys.stderr)

    print("\nRunning t-SNE...", file=sys.stderr)
    matrix = np.array(rows)
    matrix = StandardScaler().fit_transform(matrix)

    perplexity = min(30, len(matrix) - 1)
    tsne_start = time.perf_counter()
    coords = TSNE(n_components=2, perplexity=perplexity, random_state=42, max_iter=1000).fit_transform(matrix)
    tsne_elapsed = time.perf_counter() - tsne_start
    print(f"t-SNE: {tsne_elapsed:.2f}s", file=sys.stderr)

    total = time.perf_counter() - extract_start
    print(f"Total: {total:.2f}s\n", file=sys.stderr)

    for i, s in enumerate(valid):
        s["x"] = float(coords[i, 0])
        s["y"] = float(coords[i, 1])
        del s["path"]  # don't leak absolute paths

    json.dump(valid, sys.stdout)


if __name__ == "__main__":
    main()
