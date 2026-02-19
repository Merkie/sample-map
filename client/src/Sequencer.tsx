import { createSignal, createEffect, onCleanup, createMemo, For, Show, untrack } from "solid-js";
import { CircleDashed, CircleDotDashed, Dices, GripVertical, Library, Lock, LockOpen, Plus, Save } from "lucide-solid";
import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  createSortable,
  closestCenter,
  transformStyle,
} from "@thisbeyond/solid-dnd";
import type { SampleNode } from "./engine";
import { FACTORY_PRESETS } from "./presets";
import {
  STEPS,
  engine, seqSamples, setSeqSamples, armedTrack, setArmedTrack,
  seqPlaying, setSeqPlaying, seqBpm, setSeqBpm, seqSwing, setSeqSwing,
  presets, setPresets, setShowAdaptModal, setApplyPresetFn,
  seqGrid, setSeqGrid, seqStep, setSeqStep,
  seqLockedTracks, setSeqLockedTracks,
  seqTrackVolumes, setSeqTrackVolumes,
  seqScatterEnabled, setSeqScatterEnabled,
  seqScatterRadius, setSeqScatterRadius,
  addSeqTrack,
  type SavedPreset,
} from "./state";

const FALLBACK_TRACKS = [
  { id: "fallback-0", name: "Kick", color: "#818cf8" },
  { id: "fallback-1", name: "Snare", color: "#ef4444" },
  { id: "fallback-2", name: "Hat", color: "#eab308" },
  { id: "fallback-3", name: "Perc", color: "#22c55e" },
];

export default function Sequencer() {
  const tracks = createMemo(() =>
    seqSamples().length > 0
      ? seqSamples().map((s) => ({ id: s.id, name: s.name, color: s.color }))
      : FALLBACK_TRACKS,
  );

  // Component-local UI state only
  const [showPresets, setShowPresets] = createSignal(false);
  const [showSaveInput, setShowSaveInput] = createSignal(false);
  const [saveName, setSaveName] = createSignal("");
  const [scatterPopupTrack, setScatterPopupTrack] = createSignal(-1);
  const sortableIds = createMemo(() => tracks().map((t) => t.id));

  /** Apply a preset: resolve samples by path or zone, set grid/bpm/swing */
  const applyPreset = (preset: SavedPreset, adapt: boolean) => {
    const eng = engine();
    if (!eng) return;

    const usedIds = new Set<string>();
    const resolvedSamples: SampleNode[] = [];
    const newGrid: boolean[][] = [];

    for (const track of preset.tracks) {
      let node: SampleNode | undefined;

      // Try exact match by path first (if not adapting and path is set)
      if (!adapt && track.samplePath) {
        node = eng.nodes.find((n) => n.relativePath === track.samplePath && !usedIds.has(n.id));
      }

      // Try to reuse a current sample from the matching zone
      if (!node) {
        const current = seqSamples();
        node = current.find((s) => s.zone === track.sampleCategory && !usedIds.has(s.id));
      }

      // Fall back to zone-based random pick
      if (!node) {
        const zonePool = eng.nodes.filter((n) => n.zone === track.sampleCategory && !usedIds.has(n.id));
        const pool = zonePool.length > 0 ? zonePool : eng.nodes.filter((n) => !usedIds.has(n.id));
        if (pool.length > 0) {
          node = pool[Math.floor(Math.random() * pool.length)];
        }
      }

      if (node) {
        resolvedSamples.push(node);
        usedIds.add(node.id);
        newGrid.push([...track.pattern]);
      }
    }

    if (resolvedSamples.length > 0) {
      // Coordinated update: set all parallel arrays atomically
      setSeqSamples(resolvedSamples);
      setSeqGrid(newGrid);
      setSeqBpm(preset.bpm);
      setSeqSwing(preset.swing);
      setSeqLockedTracks(Array.from({ length: resolvedSamples.length }, () => false));
      setSeqTrackVolumes(preset.tracks.map((t) => t.volume ?? 1.0));
      setSeqScatterEnabled(preset.tracks.map((t) => t.scatter ?? false));
      setSeqScatterRadius(preset.tracks.map((t) => t.scatterRadius ?? 30));
      eng.highlightedNodeIds = new Set(resolvedSamples.map((s) => s.id));
    }
    setShowPresets(false);
  };

  /** Load a preset: check if samples match, show adapt modal if needed */
  const handleLoadPreset = (preset: SavedPreset) => {
    const eng = engine();
    if (!eng) return;

    let missingCount = 0;
    for (const track of preset.tracks) {
      if (!track.samplePath || !eng.nodes.find((n) => n.relativePath === track.samplePath)) {
        missingCount++;
      }
    }

    // Factory presets have empty samplePaths — skip the modal and adapt directly
    const isFactory = preset.tracks.every((t) => !t.samplePath);
    if (missingCount === 0) {
      applyPreset(preset, false);
    } else if (isFactory) {
      applyPreset(preset, true);
    } else {
      setShowAdaptModal({ preset, missingCount });
      setShowPresets(false);
    }
  };

  // Register applyPreset so the adaptation modal can call it
  setApplyPresetFn(() => applyPreset);

  /** Save current state as a user preset */
  const savePreset = async () => {
    const name = saveName().trim();
    if (!name) return;

    const samples = seqSamples();
    const g = seqGrid();
    const preset: Omit<SavedPreset, "id"> = {
      name,
      bpm: seqBpm(),
      swing: seqSwing(),
      tracks: samples.map((s, i) => ({
        samplePath: s.relativePath,
        sampleCategory: s.zone,
        pattern: [...(g[i] || Array(STEPS).fill(false))],
        volume: seqTrackVolumes()[i] ?? 1.0,
        scatter: seqScatterEnabled()[i] ?? false,
        scatterRadius: seqScatterRadius()[i] ?? 30,
      })),
    };

    const saved: SavedPreset = {
      ...preset,
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    setPresets((prev) => {
      const next = [...prev, saved];
      try { localStorage.setItem("sample-map-presets", JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
    setSaveName("");
    setShowSaveInput(false);
  };

  // Sync engine scatter circles from scatter state (valid effect: syncs reactive state → external engine object)
  createEffect(() => {
    const eng = engine();
    if (!eng) return;
    const samples = seqSamples();
    const enabled = seqScatterEnabled();
    const radii = seqScatterRadius();
    const circles: Array<{ nodeId: string; radius: number }> = [];
    for (let i = 0; i < samples.length; i++) {
      if (enabled[i] && samples[i]) {
        circles.push({ nodeId: samples[i].id, radius: radii[i] ?? 30 });
      }
    }
    eng.scatterCircles = circles;
  });

  // Scheduler (valid effect: manages timers, an external system)
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const clearScheduler = () => {
    if (timerId != null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  createEffect(() => {
    if (seqPlaying()) {
      let step = 0;
      setSeqStep(0);

      const tick = () => {
        // Read grid/bpm/swing without tracking so they don't re-trigger the effect
        const g = untrack(seqGrid);
        const curBpm = untrack(seqBpm);
        const curSwing = untrack(seqSwing);

        // Trigger samples for active cells
        const samples = untrack(seqSamples);
        const volumes = untrack(seqTrackVolumes);
        const scatter = untrack(seqScatterEnabled);
        const radii = untrack(seqScatterRadius);
        const eng = engine();
        for (let row = 0; row < g.length; row++) {
          if (g[row][step] && samples[row]) {
            let target = samples[row];
            if (scatter[row] && eng) {
              const nearby = eng.getNodesInRadius(samples[row], radii[row] ?? 30);
              if (nearby.length > 0) {
                target = nearby[Math.floor(Math.random() * nearby.length)];
              }
            }
            target.glow = 1;
            eng?.playSample(target, true, volumes[row] ?? 1.0);
          }
        }
        setSeqStep(step);

        // Advance
        const nextStep = (step + 1) % STEPS;
        const isOdd = step % 2 === 1;

        // Timing
        const stepMs = 60000 / curBpm / 4;
        const swingOffset = stepMs * (curSwing / 100) * 0.33;
        const delay = isOdd ? stepMs - swingOffset : stepMs + swingOffset;

        step = nextStep;
        timerId = setTimeout(tick, delay);
      };

      tick();

      // Clean up if effect re-runs (e.g. playing toggled off then on)
      onCleanup(clearScheduler);
    } else {
      clearScheduler();
      setSeqStep(-1);
    }
  });

  onCleanup(clearScheduler);

  const toggle = (row: number, col: number) => {
    setSeqGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = !next[row][col];
      return next;
    });
  };

  const handleDragEnd = ({ draggable, droppable }: { draggable: any; droppable?: any }) => {
    if (!draggable || !droppable) return;

    const samples = seqSamples();
    const fromIdx = samples.findIndex((s) => s.id === draggable.id);
    const toIdx = samples.findIndex((s) => s.id === droppable.id);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const reorder = <T,>(arr: T[]): T[] => {
      const next = [...arr];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    };

    // Coordinated reorder of all parallel arrays
    setSeqSamples(reorder);
    setSeqGrid((prev) => reorder(prev));
    setSeqLockedTracks((prev) => reorder(prev));
    setSeqTrackVolumes((prev) => reorder(prev));
    setSeqScatterEnabled((prev) => reorder(prev));
    setSeqScatterRadius((prev) => reorder(prev));

    // Adjust armed track index
    const armed = armedTrack();
    if (armed >= 0) {
      if (armed === fromIdx) {
        setArmedTrack(toIdx);
      } else if (fromIdx < armed && toIdx >= armed) {
        setArmedTrack(armed - 1);
      } else if (fromIdx > armed && toIdx <= armed) {
        setArmedTrack(armed + 1);
      }
    }

    const eng = engine();
    if (eng) {
      eng.highlightedNodeIds = new Set(seqSamples().map((s) => s.id));
    }
  };

  const handleRandomize = () => {
    const eng = engine();
    if (!eng) return;
    const current = seqSamples();
    const locked = seqLockedTracks();
    const next: SampleNode[] = [];
    const usedIds = new Set<string>();
    // Pre-reserve locked track sample IDs
    for (let i = 0; i < current.length; i++) {
      if (locked[i]) usedIds.add(current[i].id);
    }
    for (let i = 0; i < current.length; i++) {
      if (locked[i]) {
        next.push(current[i]);
        continue;
      }
      const sample = current[i];
      const zonePool = eng.nodes.filter((n) => n.zone === sample.zone && n.id !== sample.id && !usedIds.has(n.id));
      const pool = zonePool.length > 0 ? zonePool : eng.nodes.filter((n) => n.id !== sample.id && !usedIds.has(n.id));
      const picked = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : sample;
      next.push(picked);
      usedIds.add(picked.id);
    }
    setSeqSamples(next);
    eng.highlightedNodeIds = new Set(next.map((s) => s.id));
  };

  const handleAddTrack = () => {
    const eng = engine();
    if (!eng || eng.nodes.length === 0) return;
    const usedIds = new Set(seqSamples().map((s) => s.id));
    const available = eng.nodes.filter((n) => !usedIds.has(n.id));
    const pool = available.length > 0 ? available : eng.nodes;
    const sample = pool[Math.floor(Math.random() * pool.length)];
    // Coordinated add: updates seqSamples + all parallel arrays atomically
    addSeqTrack(sample);
    eng.highlightedNodeIds = new Set([...seqSamples().map((s) => s.id)]);
    setArmedTrack(seqSamples().length - 1);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget || !(e.target as HTMLElement).closest?.("[data-seq-interactive]")) {
          engine()?.onEscape();
          setArmedTrack(-1);
        }
      }}
      style={{
        "flex-shrink": "0",
        background: "linear-gradient(180deg, rgba(16,18,24,0.96) 0%, rgba(10,12,16,0.98) 100%)",
        "border-top": "1px solid rgba(255,255,255,0.06)",
        "box-shadow": "0 -4px 24px rgba(0,0,0,0.6)",
        "backdrop-filter": "blur(16px)",
        "-webkit-backdrop-filter": "blur(16px)",
        "z-index": "20",
        "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        "user-select": "none",
        display: "flex",
        "flex-direction": "column",
        padding: "10px 0 12px 0",
      }}
    >
      {/* Transport bar */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "16px",
          padding: "0 16px 8px 16px",
          "border-bottom": "1px solid rgba(255,255,255,0.04)",
          "margin-bottom": "6px",
        }}
      >
        {/* Play / Stop */}
        <button
          onClick={() => setSeqPlaying(!seqPlaying())}
          style={{
            width: "28px",
            height: "28px",
            border: "1px solid rgba(255,255,255,0.12)",
            "border-radius": "6px",
            background: seqPlaying()
              ? "rgba(100,225,225,0.12)"
              : "rgba(255,255,255,0.04)",
            color: seqPlaying() ? "rgba(100,225,225,1)" : "rgba(255,255,255,0.6)",
            cursor: "pointer",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "font-size": "12px",
            "flex-shrink": "0",
            transition: "all 0.15s",
          }}
        >
          <Show
            when={seqPlaying()}
            fallback={
              /* Play triangle */
              <div
                style={{
                  width: "0",
                  height: "0",
                  "border-left": "9px solid currentColor",
                  "border-top": "6px solid transparent",
                  "border-bottom": "6px solid transparent",
                  "margin-left": "2px",
                }}
              />
            }
          >
            {/* Stop icon */}
            <div
              style={{
                width: "10px",
                height: "10px",
                "border-radius": "2px",
                background: "currentColor",
              }}
            />
          </Show>
        </button>

        {/* BPM */}
        <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
          <span
            style={{
              "font-size": "0.62rem",
              "font-weight": "500",
              "letter-spacing": "0.08em",
              "text-transform": "uppercase",
              color: "rgba(255,255,255,0.35)",
            }}
          >
            BPM
          </span>
          <input
            type="number"
            value={seqBpm()}
            min={40}
            max={300}
            onInput={(e) => setSeqBpm(parseInt(e.currentTarget.value) || 120)}
            style={{
              width: "48px",
              height: "24px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              "border-radius": "4px",
              color: "rgba(255,255,255,0.8)",
              "font-size": "0.72rem",
              "font-family": "monospace",
              "text-align": "center",
              outline: "none",
              "-moz-appearance": "textfield",
            }}
          />
        </div>

        {/* Swing */}
        <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
          <span
            style={{
              "font-size": "0.62rem",
              "font-weight": "500",
              "letter-spacing": "0.08em",
              "text-transform": "uppercase",
              color: "rgba(255,255,255,0.35)",
            }}
          >
            Swing
          </span>
          <div style={{ position: "relative", width: "80px", height: "24px", display: "flex", "align-items": "center" }}>
            <input
              class="swing-slider"
              type="range"
              min={0}
              max={100}
              value={seqSwing()}
              onInput={(e) => setSeqSwing(parseInt(e.currentTarget.value))}
              style={{
                width: "100%",
                height: "4px",
                "-webkit-appearance": "none",
                appearance: "none",
                background: `linear-gradient(to right, rgba(100,225,225,0.5) ${seqSwing()}%, rgba(255,255,255,0.08) ${seqSwing()}%)`,
                "border-radius": "2px",
                outline: "none",
                cursor: "pointer",
              }}
            />
          </div>
          <span
            style={{
              "font-size": "0.65rem",
              "font-family": "monospace",
              color: "rgba(255,255,255,0.4)",
              width: "28px",
              "text-align": "right",
            }}
          >
            {seqSwing()}%
          </span>
        </div>

        {/* Randomize */}
        <button
          onClick={handleRandomize}
          title="Randomize samples"
          style={{
            width: "28px",
            height: "28px",
            border: "1px solid rgba(255,255,255,0.12)",
            "border-radius": "6px",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "flex-shrink": "0",
            transition: "all 0.15s",
            padding: "0",
          }}
        >
          <Dices size={14} />
        </button>

        {/* Presets */}
        <div data-seq-interactive style={{ position: "relative" }}>
          <button
            onClick={() => setShowPresets(!showPresets())}
            title="Pattern presets"
            style={{
              width: "28px",
              height: "28px",
              border: "1px solid rgba(255,255,255,0.12)",
              "border-radius": "6px",
              background: showPresets()
                ? "rgba(100,225,225,0.12)"
                : "rgba(255,255,255,0.04)",
              color: showPresets()
                ? "rgba(100,225,225,1)"
                : "rgba(255,255,255,0.5)",
              cursor: "pointer",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              "flex-shrink": "0",
              transition: "all 0.15s",
              padding: "0",
            }}
          >
            <Library size={14} />
          </button>

          <Show when={showPresets()}>
            {/* Backdrop to close on click-outside */}
            <div
              onClick={() => setShowPresets(false)}
              style={{
                position: "fixed",
                inset: "0",
                "z-index": "99",
              }}
            />
            {/* Dropdown */}
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: "0",
                "min-width": "180px",
                "max-height": "320px",
                "overflow-y": "auto",
                background: "rgba(20,22,28,0.97)",
                border: "1px solid rgba(255,255,255,0.1)",
                "border-radius": "8px",
                "box-shadow": "0 8px 32px rgba(0,0,0,0.6)",
                "backdrop-filter": "blur(16px)",
                "-webkit-backdrop-filter": "blur(16px)",
                padding: "4px",
                "z-index": "100",
              }}
            >
              {/* Section: Patterns */}
              <div
                style={{
                  padding: "5px 12px 3px",
                  "font-size": "0.58rem",
                  "font-weight": "600",
                  "letter-spacing": "0.1em",
                  "text-transform": "uppercase",
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                Patterns
              </div>
              <For each={FACTORY_PRESETS}>
                {(preset) => (
                  <div
                    onClick={() => handleLoadPreset(preset)}
                    style={{
                      padding: "7px 12px",
                      "font-size": "0.72rem",
                      color:
                        preset.name === "Clear"
                          ? "rgba(255,255,255,0.35)"
                          : "rgba(255,255,255,0.75)",
                      "border-radius": "5px",
                      cursor: "pointer",
                      transition: "background 0.1s",
                      "white-space": "nowrap",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(255,255,255,0.08)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    {preset.name}
                  </div>
                )}
              </For>

              {/* Section: My Presets (only if any exist) */}
              <Show when={presets().length > 0}>
                <div
                  style={{
                    height: "1px",
                    background: "rgba(255,255,255,0.06)",
                    margin: "4px 8px",
                  }}
                />
                <div
                  style={{
                    padding: "5px 12px 3px",
                    "font-size": "0.58rem",
                    "font-weight": "600",
                    "letter-spacing": "0.1em",
                    "text-transform": "uppercase",
                    color: "rgba(255,255,255,0.3)",
                  }}
                >
                  My Presets
                </div>
                <For each={presets()}>
                  {(preset) => (
                    <div
                      onClick={() => handleLoadPreset(preset)}
                      style={{
                        padding: "7px 12px",
                        "font-size": "0.72rem",
                        color: "rgba(255,255,255,0.75)",
                        "border-radius": "5px",
                        cursor: "pointer",
                        transition: "background 0.1s",
                        "white-space": "nowrap",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.08)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {preset.name}
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Show>
        </div>

        {/* Save Preset */}
        <div data-seq-interactive style={{ position: "relative" }}>
          <button
            onClick={() => { setShowSaveInput(!showSaveInput()); setSaveName(""); }}
            title="Save preset"
            style={{
              width: "28px",
              height: "28px",
              border: "1px solid rgba(255,255,255,0.12)",
              "border-radius": "6px",
              background: showSaveInput()
                ? "rgba(100,225,225,0.12)"
                : "rgba(255,255,255,0.04)",
              color: showSaveInput()
                ? "rgba(100,225,225,1)"
                : "rgba(255,255,255,0.5)",
              cursor: "pointer",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              "flex-shrink": "0",
              transition: "all 0.15s",
              padding: "0",
            }}
          >
            <Save size={14} />
          </button>

          <Show when={showSaveInput()}>
            <div
              onClick={() => setShowSaveInput(false)}
              style={{
                position: "fixed",
                inset: "0",
                "z-index": "99",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: "0",
                "min-width": "200px",
                background: "rgba(20,22,28,0.97)",
                border: "1px solid rgba(255,255,255,0.1)",
                "border-radius": "8px",
                "box-shadow": "0 8px 32px rgba(0,0,0,0.6)",
                "backdrop-filter": "blur(16px)",
                "-webkit-backdrop-filter": "blur(16px)",
                padding: "10px 12px",
                "z-index": "100",
                display: "flex",
                gap: "6px",
                "align-items": "center",
              }}
            >
              <input
                type="text"
                placeholder="Preset name..."
                value={saveName()}
                onInput={(e) => setSaveName(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter") savePreset(); }}
                autofocus
                style={{
                  flex: "1",
                  height: "26px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  "border-radius": "4px",
                  color: "rgba(255,255,255,0.8)",
                  "font-size": "0.72rem",
                  "font-family": "inherit",
                  padding: "0 8px",
                  outline: "none",
                }}
              />
              <button
                onClick={savePreset}
                style={{
                  height: "26px",
                  padding: "0 10px",
                  background: "rgba(100,225,225,0.15)",
                  border: "1px solid rgba(100,225,225,0.3)",
                  "border-radius": "4px",
                  color: "rgba(100,225,225,1)",
                  "font-size": "0.65rem",
                  "font-weight": "600",
                  "letter-spacing": "0.05em",
                  cursor: "pointer",
                  "font-family": "inherit",
                  "white-space": "nowrap",
                }}
              >
                Save
              </button>
            </div>
          </Show>
        </div>
      </div>

      {/* Grid */}
      <DragDropProvider
        onDragEnd={handleDragEnd}
        collisionDetector={closestCenter}
      >
        <DragDropSensors />
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "3px",
            padding: "0 16px",
            overflow: "hidden",
          }}
        >
          <SortableProvider ids={sortableIds()}>
            <For each={tracks()}>
              {(track, rowIdx) => {
                const sortable = createSortable(track.id);
                return (
                  <div
                    ref={sortable.ref}
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "6px",
                      opacity: sortable.isActiveDraggable ? "0.25" : "1",
                      ...transformStyle(sortable.transform),
                      transition: sortable.isActiveDraggable ? undefined : "transform 200ms ease",
                      "z-index": sortable.isActiveDraggable ? "1" : undefined,
                    }}
                  >
                    {/* Volume fader */}
                    <div
                      data-seq-interactive
                      style={{
                        width: "20px",
                        height: "48px",
                        "flex-shrink": "0",
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "center",
                        position: "relative",
                      }}
                    >
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(seqTrackVolumes()[rowIdx()] * 100)}
                        onInput={(e) => {
                          const idx = rowIdx();
                          const val = parseInt(e.currentTarget.value) / 100;
                          setSeqTrackVolumes((prev) => {
                            const next = [...prev];
                            next[idx] = val;
                            return next;
                          });
                        }}
                        style={{
                          width: "40px",
                          height: "4px",
                          "-webkit-appearance": "none",
                          appearance: "none",
                          background: `linear-gradient(to right, ${track.color} ${Math.round(seqTrackVolumes()[rowIdx()] * 100)}%, rgba(255,255,255,0.08) ${Math.round(seqTrackVolumes()[rowIdx()] * 100)}%)`,
                          "border-radius": "2px",
                          outline: "none",
                          cursor: "pointer",
                          transform: "rotate(-90deg)",
                          "transform-origin": "center center",
                        }}
                        title={`Volume: ${Math.round(seqTrackVolumes()[rowIdx()] * 100)}%`}
                      />
                    </div>

                    {/* Track label — flex column: name + buttons */}
                    <div
                      data-seq-interactive
                      style={{
                        width: "100px",
                        "flex-shrink": "0",
                        display: "flex",
                        "flex-direction": "column",
                        gap: "2px",
                        padding: "2px 0",
                      }}
                    >
                      {/* Sample name */}
                      <div
                        onClick={() => {
                          const idx = rowIdx();
                          if (armedTrack() === idx) {
                            setArmedTrack(-1);
                          } else {
                            setArmedTrack(idx);
                            const samples = seqSamples();
                            if (samples[idx]) {
                              engine()?.focusNode(samples[idx]);
                            }
                          }
                        }}
                        style={{
                          "font-size": "0.72rem",
                          "font-weight": "600",
                          "letter-spacing": "0.03em",
                          color: armedTrack() === rowIdx() ? "#ffffff" : track.color,
                          opacity: armedTrack() === rowIdx() ? "1" : "0.85",
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                          "white-space": "nowrap",
                          cursor: "pointer",
                          transition: "color 0.15s, opacity 0.15s",
                          "line-height": "1.2",
                        }}
                        title={armedTrack() === rowIdx() ? "Click a sample on the map..." : track.name}
                      >
                        {track.name}
                      </div>

                      {/* Buttons row: grip handle + lock */}
                      <div style={{ display: "flex", gap: "4px", "align-items": "center" }}>
                        {/* Grip handle */}
                        <div
                          data-seq-interactive
                          {...sortable.dragActivators}
                          style={{
                            color: "rgba(255,255,255,0.25)",
                            cursor: "grab",
                            display: "flex",
                            "align-items": "center",
                            padding: "1px",
                            "border-radius": "2px",
                            transition: "color 0.15s",
                          }}
                          title="Drag to reorder"
                        >
                          <GripVertical size={11} />
                        </div>

                        {/* Lock button */}
                        <div
                          data-seq-interactive
                          onClick={(e) => {
                            e.stopPropagation();
                            const idx = rowIdx();
                            setSeqLockedTracks((prev) => {
                              const next = [...prev];
                              next[idx] = !next[idx];
                              return next;
                            });
                          }}
                          style={{
                            color: seqLockedTracks()[rowIdx()]
                              ? "rgba(100,225,225,0.8)"
                              : "rgba(255,255,255,0.2)",
                            cursor: "pointer",
                            display: "flex",
                            "align-items": "center",
                            padding: "1px",
                            "border-radius": "2px",
                            transition: "color 0.15s",
                          }}
                          title={seqLockedTracks()[rowIdx()] ? "Unlock track (allow randomize)" : "Lock track (prevent randomize)"}
                        >
                          <Show when={seqLockedTracks()[rowIdx()]} fallback={<LockOpen size={10} />}>
                            <Lock size={10} />
                          </Show>
                        </div>

                        {/* Scatter toggle */}
                        <div
                          data-seq-interactive
                          style={{ position: "relative", "z-index": scatterPopupTrack() === rowIdx() ? "50" : undefined }}
                          onMouseEnter={() => setScatterPopupTrack(rowIdx())}
                          onMouseLeave={() => setScatterPopupTrack(-1)}
                        >
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              const idx = rowIdx();
                              setSeqScatterEnabled((prev) => {
                                const next = [...prev];
                                next[idx] = !next[idx];
                                return next;
                              });
                            }}
                            style={{
                              color: seqScatterEnabled()[rowIdx()]
                                ? "rgba(45, 212, 191, 0.9)"
                                : "rgba(255,255,255,0.2)",
                              cursor: "pointer",
                              display: "flex",
                              "align-items": "center",
                              padding: "1px",
                              "border-radius": "2px",
                              transition: "color 0.15s",
                            }}
                            title={seqScatterEnabled()[rowIdx()] ? "Disable scatter" : "Enable scatter"}
                          >
                            <Show when={seqScatterEnabled()[rowIdx()]} fallback={<CircleDashed size={10} />}>
                              <CircleDotDashed size={10} />
                            </Show>
                          </div>

                          {/* Scatter radius popup (on hover) */}
                          <Show when={scatterPopupTrack() === rowIdx()}>
                            <div
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: "50%",
                                transform: "translateX(-50%)",
                                "padding-top": "6px",
                              }}
                            >
                            <div
                              style={{
                                background: "rgb(20,22,28)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                "border-radius": "6px",
                                "box-shadow": "0 6px 24px rgba(0,0,0,0.8)",
                                padding: "5px 8px",
                                "z-index": "100",
                                display: "flex",
                                "align-items": "center",
                                gap: "6px",
                                "white-space": "nowrap",
                              }}
                            >
                              <input
                                data-seq-interactive
                                type="range"
                                min={10}
                                max={100}
                                value={seqScatterRadius()[rowIdx()]}
                                onInput={(e) => {
                                  const idx = rowIdx();
                                  const val = parseInt(e.currentTarget.value);
                                  setSeqScatterRadius((prev) => {
                                    const next = [...prev];
                                    next[idx] = val;
                                    return next;
                                  });
                                }}
                                style={{
                                  width: "56px",
                                  height: "3px",
                                  "-webkit-appearance": "none",
                                  appearance: "none",
                                  background: `linear-gradient(to right, rgba(45,212,191,0.5) ${((seqScatterRadius()[rowIdx()] - 10) / 90) * 100}%, rgba(255,255,255,0.08) ${((seqScatterRadius()[rowIdx()] - 10) / 90) * 100}%)`,
                                  "border-radius": "2px",
                                  outline: "none",
                                  cursor: "pointer",
                                }}
                              />
                              <span
                                style={{
                                  "font-size": "0.55rem",
                                  "font-family": "monospace",
                                  color: "rgba(255,255,255,0.45)",
                                  "min-width": "18px",
                                  "text-align": "right",
                                }}
                              >
                                {seqScatterRadius()[rowIdx()]}
                              </span>
                            </div>
                            </div>
                          </Show>
                        </div>
                      </div>
                    </div>

                    {/* Steps */}
                    <div style={{ display: "flex", gap: "3px", flex: "1" }}>
                      <For each={seqGrid()[rowIdx()]}>
                        {(active, colIdx) => {
                          const isOddGroup = () => Math.floor(colIdx() / 4) % 2 === 1;
                          const isPlayhead = () => seqStep() === colIdx();
                          return (
                            <div
                              onClick={() => toggle(rowIdx(), colIdx())}
                              style={{
                                position: "relative",
                                flex: "1",
                                height: "48px",
                                "min-width": "20px",
                                "border-radius": "5px",
                                background: active
                                  ? track.color
                                  : isOddGroup()
                                    ? "rgba(255,255,255,0.03)"
                                    : "rgba(255,255,255,0.055)",
                                cursor: "pointer",
                                transition: "background 0.1s, box-shadow 0.1s",
                                "box-shadow": isPlayhead()
                                  ? active
                                    ? `0 0 12px ${track.color}88, inset 0 1px 0 rgba(255,255,255,0.15), inset 0 0 0 1.5px rgba(255,255,255,0.5)`
                                    : "inset 0 0 0 1.5px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.03)"
                                  : active
                                    ? `0 0 8px ${track.color}44, inset 0 1px 0 rgba(255,255,255,0.15)`
                                    : "inset 0 1px 0 rgba(255,255,255,0.03)",
                                overflow: "hidden",
                                "margin-left": "0",
                              }}
                            >
                              {/* Top notch */}
                              <div
                                style={{
                                  position: "absolute",
                                  top: "3px",
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  width: "40%",
                                  height: "4px",
                                  "border-radius": "2px",
                                  background: active
                                    ? "rgba(0,0,0,0.25)"
                                    : "rgba(255,255,255,0.04)",
                                }}
                              />
                              {/* Playhead overlay */}
                              <Show when={isPlayhead()}>
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: "0",
                                    "border-radius": "5px",
                                    background: active
                                      ? "rgba(255,255,255,0.12)"
                                      : "rgba(255,255,255,0.06)",
                                    "pointer-events": "none",
                                  }}
                                />
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                );
              }}
            </For>
          </SortableProvider>

          {/* Add track button */}
          <div
            data-seq-interactive
            onClick={handleAddTrack}
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              height: "28px",
              "margin-top": "2px",
              "border-radius": "5px",
              border: "1px dashed rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.25)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <Plus size={14} />
          </div>
        </div>
      </DragDropProvider>
    </div>
  );
}
