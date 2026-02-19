#!/usr/bin/env python3
"""Plot t-SNE embeddings with zone coloring and sample labels for visual tuning."""

import os, sys, warnings, math
from pathlib import Path
import numpy as np
import librosa
from sklearn.preprocessing import StandardScaler
from sklearn.manifold import TSNE
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors

warnings.filterwarnings("ignore")

# Try matplotlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ZONE_COLORS = {"kick": "#ef4444", "snare": "#3b82f6", "hihat": "#22c55e", "perc": "#eab308"}
ZONE_NAMES = ["kick", "snare", "perc", "hihat"]

root = Path("samples")

# ── Discover & extract features ──
samples = []
for dirpath, _, filenames in os.walk(root):
    for fname in filenames:
        fpath = Path(dirpath) / fname
        if ".asd" in fpath.suffixes: continue
        if fpath.suffix.lower() in {".wav", ".mp3"}:
            parts = Path(dirpath).relative_to(root).parts
            samples.append({"name": fpath.stem, "path": str(fpath),
                            "category": parts[-1] if parts else "uncategorized"})

print(f"Extracting features from {len(samples)} samples...")
valid = []
rows = []
for s in samples:
    try:
        y, sr = librosa.load(s["path"], sr=22050, mono=True)
    except: continue
    dur = librosa.get_duration(y=y, sr=sr)
    # Filter like the server does: max 1.5s, no loops
    if dur > 1.5: continue
    if "loop" in s["name"].lower(): continue
    rms = float(np.mean(librosa.feature.rms(y=y)[0]))
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y)[0]))
    cent = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)[0]))
    bw = float(np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]))
    roll = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr)[0]))
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)[0]))
    contrast = [float(np.mean(band)) for band in librosa.feature.spectral_contrast(y=y, sr=sr)]
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_means = [float(np.mean(mfccs[i])) for i in range(13)]
    s["duration"] = dur
    s["centroid"] = cent
    valid.append(s)
    # base: [dur, rms, zcr, cent, bw, roll, flatness, contrast(7), mfccs(13)] = 26 features
    rows.append([dur, rms, zcr, cent, bw, roll, flatness] + contrast + mfcc_means)

print(f"Using {len(valid)} samples (after duration/loop filter)")
matrix_raw = np.array(rows)


def run_config(matrix_raw, dur_w, rms_w, perplexity=30, label="", use_old_features=False):
    if use_old_features:
        # Original 19 features: [dur, rms, zcr, cent, bw, roll, mfcc0..12]
        # Skip flatness (col 6) and contrast (cols 7..13)
        old_cols = list(range(6)) + list(range(14, matrix_raw.shape[1]))
        mat = matrix_raw[:, old_cols].copy()
    else:
        mat = matrix_raw.copy()
    matrix = StandardScaler().fit_transform(mat)
    matrix[:, 0] *= dur_w
    matrix[:, 1] *= rms_w

    perp = min(perplexity, len(matrix) - 1)
    coords = TSNE(n_components=2, perplexity=perp, random_state=42, max_iter=1000).fit_transform(matrix)

    # Zone classification
    n_zones = min(4, len(coords))
    km = KMeans(n_clusters=n_zones, random_state=42, n_init=10)
    labels = km.fit_predict(coords)
    k_smooth = min(7, len(coords) - 1)
    nn = NearestNeighbors(n_neighbors=k_smooth + 1).fit(coords)
    _, indices = nn.kneighbors(coords)
    changed = True
    passes = 0
    while changed and passes < 10:
        changed = False
        for i in range(len(labels)):
            nl = labels[indices[i][1:]]
            counts = np.bincount(nl, minlength=n_zones)
            majority = int(np.argmax(counts))
            if counts[majority] > k_smooth // 2 and majority != labels[i]:
                labels[i] = majority
                changed = True
        passes += 1

    # Bisector reconciliation
    new_centroids = np.zeros((n_zones, 2))
    cnts = np.zeros(n_zones)
    for i in range(len(labels)):
        new_centroids[labels[i]] += coords[i]
        cnts[labels[i]] += 1
    for c in range(n_zones):
        if cnts[c] > 0: new_centroids[c] /= cnts[c]
    for i in range(len(labels)):
        dists = np.sum((coords[i] - new_centroids) ** 2, axis=1)
        labels[i] = int(np.argmin(dists))

    # Label by spectral centroid
    zone_names = ZONE_NAMES[:n_zones]
    cluster_avg = {}
    for c in range(n_zones):
        idx_c = [j for j in range(len(labels)) if labels[j] == c]
        cluster_avg[c] = np.mean([rows[j][3] for j in idx_c]) if idx_c else 0
    sorted_clusters = sorted(cluster_avg.items(), key=lambda x: x[1])
    c2z = {cid: zone_names[idx] for idx, (cid, _) in enumerate(sorted_clusters)}

    zones = [c2z[labels[i]] for i in range(len(labels))]
    return coords, zones


def plot_config(coords, zones, valid, title, filename):
    fig, ax = plt.subplots(1, 1, figsize=(20, 16))
    fig.patch.set_facecolor("#0a0a0a")
    ax.set_facecolor("#0a0a0a")

    # Plot each zone
    for zone in ZONE_NAMES:
        xs = [coords[i, 0] for i in range(len(valid)) if zones[i] == zone]
        ys = [coords[i, 1] for i in range(len(valid)) if zones[i] == zone]
        ax.scatter(xs, ys, c=ZONE_COLORS[zone], s=40, alpha=0.8, label=f"{zone} ({len(xs)})", edgecolors="white", linewidths=0.3)

    # Label samples - use small font, only label if not too crowded
    for i, s in enumerate(valid):
        name = s["name"]
        # Always label these interesting ones
        always_label = any(k in name.lower() for k in ["whistle", "ride", "cymbal", "clap", "808kick", "909kick", "snare", "open"])
        fontsize = 4.5
        alpha = 0.7
        if not always_label:
            fontsize = 3.5
            alpha = 0.45
        ax.annotate(name, (coords[i, 0], coords[i, 1]),
                    fontsize=fontsize, color="white", alpha=alpha,
                    xytext=(3, 3), textcoords="offset points")

    ax.legend(loc="upper left", fontsize=10, facecolor="#1a1a1a", edgecolor="#333",
              labelcolor="white", framealpha=0.9)
    ax.set_title(title, color="white", fontsize=14, pad=12)
    ax.tick_params(colors="#555")
    for spine in ax.spines.values():
        spine.set_color("#333")

    plt.tight_layout()
    plt.savefig(filename, dpi=150, facecolor="#0a0a0a")
    plt.close()
    print(f"Saved {filename}")


# ── Generate plots for different configs ──
configs = [
    # (name, dur_w, rms_w, perplexity, use_old_features)
    ("old_baseline", 1.0, 1.0, 30, True),
    ("new_26feat", 1.0, 1.0, 30, False),
    ("new_26feat_perp35", 1.0, 1.0, 35, False),
    ("new_26feat_rms0.8", 1.0, 0.8, 30, False),
]

whistle_idx = next((i for i, s in enumerate(valid) if "Whistle" in s["name"]), None)

for name, dw, rw, perp, old_feat in configs:
    feat_label = "19feat" if old_feat else "26feat"
    title = f"{feat_label} dur={dw} rms={rw} perp={perp}"
    print(f"\n{'='*60}")
    print(f"Running: {title}")
    coords, zones = run_config(matrix_raw, dw, rw, perp, name, use_old_features=old_feat)
    plot_config(coords, zones, valid, title, f"/tmp/tsne_{name}.png")

    # Zone counts
    from collections import Counter
    zcounts = Counter(zones)
    print(f"  Zones: {dict(sorted(zcounts.items()))}")

    # Whistle neighbors
    if whistle_idx is not None:
        wx, wy = coords[whistle_idx]
        wzone = zones[whistle_idx]
        dists = sorted([(math.sqrt((coords[i,0]-wx)**2+(coords[i,1]-wy)**2), valid[i]["name"], zones[i])
                        for i in range(len(valid)) if i != whistle_idx])
        print(f"  Whistle zone={wzone}, neighbors:")
        for d, n, z in dists[:6]:
            print(f"    {n:30s} zone={z:6s} dist={d:.1f}")

    # Check for obvious misclassifications: kicks with high centroid, hihats with low centroid
    print(f"  Suspect assignments:")
    suspects = 0
    for i, s in enumerate(valid):
        cent = s["centroid"]
        z = zones[i]
        if z == "kick" and cent > 3000:
            print(f"    {s['name']:30s} zone=kick  centroid={cent:.0f} (HIGH)")
            suspects += 1
        elif z == "hihat" and cent < 500:
            print(f"    {s['name']:30s} zone=hihat centroid={cent:.0f} (LOW)")
            suspects += 1
    if suspects == 0:
        print(f"    (none)")

print("\nDone! All plots saved to /tmp/tsne_*.png")
