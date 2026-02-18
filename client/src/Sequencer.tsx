import { createSignal, createEffect, onCleanup, createMemo, For, untrack } from "solid-js";
import { Dices, Library, Plus } from "lucide-solid";
import type { SampleNode } from "./engine";

const STEPS = 16;

// prettier-ignore
const PRESETS: { name: string; grid: boolean[][] }[] = [
  {
    name: "Four on the Floor",
    grid: [
      [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false],
      [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false],
      [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false],
      [false,false,false,false, false,false,true,false, false,false,false,false, false,false,true,false],
    ],
  },
  {
    name: "Basic Rock",
    grid: [
      [true,false,false,false, false,false,false,false, true,false,true,false, false,false,false,false],
      [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false],
      [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false],
      [false,false,false,false, false,false,false,true, false,false,false,false, false,false,false,true],
    ],
  },
  {
    name: "Hip Hop",
    grid: [
      [true,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false],
      [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,true],
      [true,false,true,false, true,false,false,true, true,false,true,false, true,false,false,true],
      [false,false,false,true, false,false,false,false, false,false,false,true, false,false,false,false],
    ],
  },
  {
    name: "Boom Bap",
    grid: [
      [true,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false],
      [false,false,false,false, true,false,false,true, false,false,false,false, true,false,false,false],
      [true,false,true,true, true,false,true,true, true,false,true,true, true,false,true,true],
      [false,false,false,false, false,true,false,false, false,false,false,false, false,true,false,false],
    ],
  },
  {
    name: "Trap",
    grid: [
      [true,false,false,false, false,false,false,false, true,false,false,true, false,false,false,false],
      [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false],
      [true,true,false,true, true,true,false,true, true,true,false,true, true,true,true,true],
      [false,false,false,false, false,false,true,false, false,false,false,false, true,false,true,false],
    ],
  },
  {
    name: "Reggaeton",
    grid: [
      [true,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false],
      [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false],
      [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false],
      [false,false,false,false, false,false,false,true, false,false,false,false, false,false,false,true],
    ],
  },
  {
    name: "Clear",
    grid: [
      Array(STEPS).fill(false),
      Array(STEPS).fill(false),
      Array(STEPS).fill(false),
      Array(STEPS).fill(false),
    ],
  },
];
const FALLBACK_TRACKS = [
  { name: "Kick", color: "#818cf8" },
  { name: "Snare", color: "#ef4444" },
  { name: "Hat", color: "#eab308" },
  { name: "Perc", color: "#22c55e" },
];

interface SequencerProps {
  samples: SampleNode[];
  onTrigger?: (node: SampleNode) => void;
  onRandomize?: () => void;
  onAddTrack?: () => void;
  onFocusSample?: (node: SampleNode) => void;
  armedTrack?: number;
  onArmTrack?: (index: number) => void;
}

export default function Sequencer(props: SequencerProps) {
  const tracks = createMemo(() =>
    props.samples.length > 0
      ? props.samples.map((s) => ({ name: s.name, color: s.color }))
      : FALLBACK_TRACKS,
  );
  const [grid, setGrid] = createSignal(
    Array.from({ length: 4 }, () => Array(STEPS).fill(false) as boolean[]),
  );
  const [playing, setPlaying] = createSignal(false);
  const [bpm, setBpm] = createSignal(120);
  const [swing, setSwing] = createSignal(0);
  const [currentStep, setCurrentStep] = createSignal(-1);
  const [showPresets, setShowPresets] = createSignal(false);

  const loadPreset = (preset: (typeof PRESETS)[number]) => {
    const numTracks = tracks().length;
    const newGrid: boolean[][] = [];
    for (let i = 0; i < numTracks; i++) {
      newGrid.push(
        i < preset.grid.length ? [...preset.grid[i]] : Array(STEPS).fill(false),
      );
    }
    setGrid(newGrid);
    setShowPresets(false);
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
    if (playing()) {
      let step = 0;
      setCurrentStep(0);

      const tick = () => {
        // Read grid/bpm/swing without tracking so they don't re-trigger the effect
        const g = untrack(grid);
        const curBpm = untrack(bpm);
        const curSwing = untrack(swing);

        // Trigger samples for active cells
        for (let row = 0; row < g.length; row++) {
          if (g[row][step] && props.samples[row] && props.onTrigger) {
            props.onTrigger(props.samples[row]);
          }
        }
        setCurrentStep(step);

        // Advance
        const nextStep = (step + 1) % STEPS;
        const isOdd = step % 2 === 1;

        // Timing
        const stepMs = 60000 / curBpm / 4;
        const swingOffset = stepMs * (curSwing / 100) * 0.33;
        const delay = isOdd ? stepMs + swingOffset : stepMs - swingOffset;

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
          onClick={() => setPlaying(!playing())}
          style={{
            width: "28px",
            height: "28px",
            border: "1px solid rgba(255,255,255,0.12)",
            "border-radius": "6px",
            background: playing()
              ? "rgba(100,225,225,0.12)"
              : "rgba(255,255,255,0.04)",
            color: playing() ? "rgba(100,225,225,1)" : "rgba(255,255,255,0.6)",
            cursor: "pointer",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "font-size": "12px",
            "flex-shrink": "0",
            transition: "all 0.15s",
          }}
        >
          {playing() ? (
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
            value={bpm()}
            min={40}
            max={300}
            onInput={(e) => setBpm(parseInt(e.currentTarget.value) || 120)}
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
              value={swing()}
              onInput={(e) => setSwing(parseInt(e.currentTarget.value))}
              style={{
                width: "100%",
                height: "4px",
                "-webkit-appearance": "none",
                appearance: "none",
                background: `linear-gradient(to right, rgba(100,225,225,0.5) ${swing()}%, rgba(255,255,255,0.08) ${swing()}%)`,
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
            {swing()}%
          </span>
        </div>

        {/* Randomize */}
        <button
          onClick={() => props.onRandomize?.()}
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
        <div style={{ position: "relative" }}>
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
                  "min-width": "160px",
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
                <For each={PRESETS}>
                  {(preset) => (
                    <div
                      onClick={() => loadPreset(preset)}
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
                onClick={() => {
                  const idx = rowIdx();
                  if (props.armedTrack === idx) {
                    props.onArmTrack?.(-1);
                  } else {
                    props.onArmTrack?.(idx);
                    if (props.samples[idx]) {
                      props.onFocusSample?.(props.samples[idx]);
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
                  color: props.armedTrack === rowIdx() ? "#ffffff" : track.color,
                  opacity: props.armedTrack === rowIdx() ? "1" : "0.7",
                  "text-align": "left",
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                  "white-space": "nowrap",
                  cursor: "pointer",
                  transition: "color 0.15s, opacity 0.15s",
                }}
                title={props.armedTrack === rowIdx() ? "Click a sample on the map..." : track.name}
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
          onClick={() => props.onAddTrack?.()}
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
