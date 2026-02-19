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
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors

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
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)[0]))
    contrast = [float(np.mean(band)) for band in librosa.feature.spectral_contrast(y=y, sr=sr)]
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_means = [float(np.mean(mfccs[i])) for i in range(13)]

    return [duration, rms, zcr, centroid, bandwidth, rolloff, flatness] + contrast + mfcc_means


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

    # Cluster t-SNE coordinates to define zones (spatial grouping, not thresholds)
    n_zones = min(4, len(coords))
    km = KMeans(n_clusters=n_zones, random_state=42, n_init=10)
    labels = km.fit_predict(coords)

    # KNN smoothing: reassign boundary samples to match their spatial neighbors
    k_smooth = min(7, len(coords) - 1)
    nn = NearestNeighbors(n_neighbors=k_smooth + 1).fit(coords)  # +1 includes self
    _, indices = nn.kneighbors(coords)
    changed = True
    passes = 0
    while changed and passes < 10:
        changed = False
        for i in range(len(labels)):
            neighbor_labels = labels[indices[i][1:]]  # skip self
            counts = np.bincount(neighbor_labels, minlength=n_zones)
            majority = int(np.argmax(counts))
            if counts[majority] > k_smooth // 2 and majority != labels[i]:
                labels[i] = majority
                changed = True
        passes += 1
    print(f"KNN smoothing: {passes} passes", file=sys.stderr)

    # Final pass: recompute centroids from smoothed labels, then reassign each
    # node to its nearest centroid. This guarantees every node is on the correct
    # side of the perpendicular bisector (required for non-overlapping zone borders).
    new_centroids = np.zeros((n_zones, 2))
    counts = np.zeros(n_zones)
    for i in range(len(labels)):
        new_centroids[labels[i]] += coords[i]
        counts[labels[i]] += 1
    for c in range(n_zones):
        if counts[c] > 0:
            new_centroids[c] /= counts[c]
    reassigned = 0
    for i in range(len(labels)):
        dists = np.sum((coords[i] - new_centroids) ** 2, axis=1)
        nearest = int(np.argmin(dists))
        if nearest != labels[i]:
            labels[i] = nearest
            reassigned += 1
    if reassigned:
        print(f"Bisector reconciliation: reassigned {reassigned} samples", file=sys.stderr)

    # Label each cluster by average spectral centroid: lowest→kick, highest→hihat.
    # Ordering is kick < perc < snare < hihat because tonal percussion (congas,
    # bongos, cowbells) has lower centroid than noisy broadband snares/claps.
    zone_names = ["kick", "perc", "snare", "hihat"][:n_zones]
    cluster_avg = {}
    for c in range(n_zones):
        indices_c = [j for j in range(len(labels)) if labels[j] == c]
        cluster_avg[c] = np.mean([rows[j][3] for j in indices_c]) if indices_c else 0
    sorted_clusters = sorted(cluster_avg.items(), key=lambda x: x[1])
    cluster_to_zone = {cid: zone_names[idx] for idx, (cid, _) in enumerate(sorted_clusters)}

    zone_counts = {}
    for i in range(len(labels)):
        z = cluster_to_zone[labels[i]]
        zone_counts[z] = zone_counts.get(z, 0) + 1
    print(f"Zones: {', '.join(f'{z}={zone_counts.get(z,0)}' for z in zone_names)}", file=sys.stderr)

    total = time.perf_counter() - extract_start
    print(f"Total: {total:.2f}s\n", file=sys.stderr)

    for i, s in enumerate(valid):
        s["x"] = float(coords[i, 0])
        s["y"] = float(coords[i, 1])
        s["zone"] = cluster_to_zone[labels[i]]
        del s["path"]  # don't leak absolute paths

    json.dump(valid, sys.stdout)


if __name__ == "__main__":
    main()
