import { createSignal, For } from "solid-js";

const STEPS = 16;
const TRACKS = [
  { name: "Kick", color: "#818cf8" },
  { name: "Snare", color: "#ef4444" },
  { name: "Hat", color: "#eab308" },
  { name: "Perc", color: "#22c55e" },
];

export default function Sequencer() {
  const [grid, setGrid] = createSignal(
    TRACKS.map(() => Array(STEPS).fill(false) as boolean[]),
  );
  const [playing, setPlaying] = createSignal(false);
  const [bpm, setBpm] = createSignal(120);
  const [swing, setSwing] = createSignal(0);

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
        <For each={TRACKS}>
          {(track, rowIdx) => (
            <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
              {/* Track label */}
              <div
                style={{
                  width: "44px",
                  "flex-shrink": "0",
                  "font-size": "0.62rem",
                  "font-weight": "600",
                  "letter-spacing": "0.05em",
                  "text-transform": "uppercase",
                  color: track.color,
                  opacity: "0.7",
                  "text-align": "right",
                  "padding-right": "4px",
                }}
              >
                {track.name}
              </div>

              {/* Steps */}
              <div style={{ display: "flex", gap: "3px", flex: "1" }}>
                <For each={grid()[rowIdx()]}>
                  {(active, colIdx) => {
                    const isOddGroup = () => Math.floor(colIdx() / 4) % 2 === 1;
                    return (
                      <div
                        onClick={() => toggle(rowIdx(), colIdx())}
                        style={{
                          position: "relative",
                          flex: "1",
                          height: "32px",
                          "min-width": "20px",
                          "border-radius": "5px",
                          background: active
                            ? track.color
                            : isOddGroup()
                              ? "rgba(255,255,255,0.03)"
                              : "rgba(255,255,255,0.055)",
                          opacity: active ? "1" : "1",
                          cursor: "pointer",
                          transition: "background 0.1s, box-shadow 0.1s",
                          "box-shadow": active
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
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
