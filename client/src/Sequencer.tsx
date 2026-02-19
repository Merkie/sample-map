import { createSignal, createEffect, onCleanup, createMemo, For, Show, untrack } from "solid-js";
import { Dices, Library, Plus, Save } from "lucide-solid";
import type { SampleNode } from "./engine";
import {
  engine, seqSamples, setSeqSamples, armedTrack, setArmedTrack,
  seqPlaying, setSeqPlaying, seqBpm, setSeqBpm, seqSwing, setSeqSwing,
  presets, setPresets, setShowAdaptModal, setApplyPresetFn,
  type SavedPreset,
} from "./state";

const STEPS = 16;

const ZONE_ORDER = ["kick", "snare", "hihat", "perc"] as const;

// prettier-ignore
const FACTORY_PRESETS: SavedPreset[] = [
  {
    id: "factory-0", name: "Four on the Floor", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,true,false, false,false,false,false, false,false,true,false] },
    ],
  },
  {
    id: "factory-1", name: "Basic Rock", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, true,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,false,true, false,false,false,false, false,false,false,true] },
    ],
  },
  {
    id: "factory-2", name: "Hip Hop", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,true] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,false,true, true,false,true,false, true,false,false,true] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,true, false,false,false,false, false,false,false,true, false,false,false,false] },
    ],
  },
  {
    id: "factory-3", name: "Boom Bap", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,true, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,true, true,false,true,true, true,false,true,true, true,false,true,true] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,true,false,false, false,false,false,false, false,true,false,false] },
    ],
  },
  {
    id: "factory-4", name: "Trap", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, true,false,false,true, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,true,false,true, true,true,false,true, true,true,false,true, true,true,true,true] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,true,false, false,false,false,false, true,false,true,false] },
    ],
  },
  {
    id: "factory-5", name: "Reggaeton", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,false,true, false,false,false,false, false,false,false,true] },
    ],
  },
  {
    id: "factory-6", name: "Clear", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: Array(STEPS).fill(false) },
      { samplePath: "", sampleCategory: "snare", pattern: Array(STEPS).fill(false) },
      { samplePath: "", sampleCategory: "hihat", pattern: Array(STEPS).fill(false) },
      { samplePath: "", sampleCategory: "perc",  pattern: Array(STEPS).fill(false) },
    ],
  },
];
const FALLBACK_TRACKS = [
  { name: "Kick", color: "#818cf8" },
  { name: "Snare", color: "#ef4444" },
  { name: "Hat", color: "#eab308" },
  { name: "Perc", color: "#22c55e" },
];

export default function Sequencer() {
  const tracks = createMemo(() =>
    seqSamples().length > 0
      ? seqSamples().map((s) => ({ name: s.name, color: s.color }))
      : FALLBACK_TRACKS,
  );
  const [grid, setGrid] = createSignal(
    Array.from({ length: 4 }, () => Array(STEPS).fill(false) as boolean[]),
  );
  const [currentStep, setCurrentStep] = createSignal(-1);
  const [showPresets, setShowPresets] = createSignal(false);
  const [showSaveInput, setShowSaveInput] = createSignal(false);
  const [saveName, setSaveName] = createSignal("");

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
      setSeqSamples(resolvedSamples);
      setGrid(newGrid);
      setSeqBpm(preset.bpm);
      setSeqSwing(preset.swing);
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

    if (missingCount === 0) {
      applyPreset(preset, false);
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
    const g = grid();
    const preset: Omit<SavedPreset, "id"> = {
      name,
      bpm: seqBpm(),
      swing: seqSwing(),
      tracks: samples.map((s, i) => ({
        samplePath: s.relativePath,
        sampleCategory: s.zone,
        pattern: [...(g[i] || Array(STEPS).fill(false))],
      })),
    };

    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      });
      if (res.ok) {
        const saved: SavedPreset = await res.json();
        setPresets((prev) => [...prev, saved]);
        setSaveName("");
        setShowSaveInput(false);
      }
    } catch { /* silently fail */ }
  };

  // Sync grid rows when tracks are added
  createEffect(() => {
    const needed = tracks().length;
    setGrid((prev) => {
      if (prev.length >= needed) return prev;
      const next = [...prev];
      while (next.length < needed) {
        next.push(Array(STEPS).fill(false) as boolean[]);
      }
      return next;
    });
  });

  // Scheduler
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
      setCurrentStep(0);

      const tick = () => {
        // Read grid/bpm/swing without tracking so they don't re-trigger the effect
        const g = untrack(grid);
        const curBpm = untrack(seqBpm);
        const curSwing = untrack(seqSwing);

        // Trigger samples for active cells
        const samples = untrack(seqSamples);
        for (let row = 0; row < g.length; row++) {
          if (g[row][step] && samples[row]) {
            samples[row].glow = 1;
            engine()?.playSample(samples[row], true);
          }
        }
        setCurrentStep(step);

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
      setCurrentStep(-1);
    }
  });

  onCleanup(clearScheduler);

  const toggle = (row: number, col: number) => {
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = !next[row][col];
      return next;
    });
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
          {seqPlaying() ? (
            /* Stop icon */
            <div
              style={{
                width: "10px",
                height: "10px",
                "border-radius": "2px",
                background: "currentColor",
              }}
            />
          ) : (
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
          )}
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
          onClick={() => {
            const eng = engine();
            if (!eng) return;
            const current = seqSamples();
            const next: SampleNode[] = [];
            const usedIds = new Set<string>();
            for (const sample of current) {
              const zonePool = eng.nodes.filter((n) => n.zone === sample.zone && n.id !== sample.id && !usedIds.has(n.id));
              const pool = zonePool.length > 0 ? zonePool : eng.nodes.filter((n) => n.id !== sample.id && !usedIds.has(n.id));
              const picked = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : sample;
              next.push(picked);
              usedIds.add(picked.id);
            }
            setSeqSamples(next);
            eng.highlightedNodeIds = new Set(next.map((s) => s.id));
          }}
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

          {showPresets() && (
            <>
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
            </>
          )}
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

          {showSaveInput() && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "3px",
          padding: "0 16px",
          "overflow-x": "auto",
        }}
      >
        <For each={tracks()}>
          {(track, rowIdx) => (
            <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
              {/* Track label */}
              <div
                data-seq-interactive
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
                  width: "52px",
                  "flex-shrink": "0",
                  "font-size": "0.62rem",
                  "font-weight": "600",
                  "letter-spacing": "0.05em",
                  "text-transform": "uppercase",
                  color: armedTrack() === rowIdx() ? "#ffffff" : track.color,
                  opacity: armedTrack() === rowIdx() ? "1" : "0.7",
                  "text-align": "left",
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                  "white-space": "nowrap",
                  cursor: "pointer",
                  transition: "color 0.15s, opacity 0.15s",
                }}
                title={armedTrack() === rowIdx() ? "Click a sample on the map..." : track.name}
              >
                {track.name}
              </div>

              {/* Steps */}
              <div style={{ display: "flex", gap: "3px", flex: "1" }}>
                <For each={grid()[rowIdx()]}>
                  {(active, colIdx) => {
                    const isOddGroup = () => Math.floor(colIdx() / 4) % 2 === 1;
                    const isPlayhead = () => currentStep() === colIdx();
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
                        {isPlayhead() && (
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
                        )}
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </For>

        {/* Add track button */}
        <div
          data-seq-interactive
          onClick={() => {
            const eng = engine();
            if (!eng || eng.nodes.length === 0) return;
            const usedIds = new Set(seqSamples().map((s) => s.id));
            const available = eng.nodes.filter((n) => !usedIds.has(n.id));
            const pool = available.length > 0 ? available : eng.nodes;
            const sample = pool[Math.floor(Math.random() * pool.length)];
            setSeqSamples((prev) => [...prev, sample]);
            eng.highlightedNodeIds = new Set([...seqSamples().map((s) => s.id), sample.id]);
            setArmedTrack(seqSamples().length - 1);
          }}
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
    </div>
  );
}
