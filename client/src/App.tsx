import { onMount, onCleanup, Show, createSignal, createEffect } from "solid-js";
import { SampleMapEngine } from "./engine";
import type { SampleNode } from "./engine";
import Sequencer from "./Sequencer";
import {
  engine, setEngine,
  loading, setLoading,
  error, setError,
  setSampleCount,
  seqActive, setSeqActive,
  seqSamples, setSeqSamples,
  armedTrack, setArmedTrack,
  seqPlaying, setSeqPlaying,
  debugActive, setDebugActive,
  showZoneBorders, setShowZoneBorders,
  setPresets,
  showAdaptModal, setShowAdaptModal,
  applyPresetFn,
} from "./state";


const HEADER_HEIGHT = 30;

/** Pick one random sample from each preferred zone for the default drum kit */
function pickSequencerSamples(nodes: SampleNode[]): SampleNode[] {
  const byZone = new Map<string, SampleNode[]>();
  for (const node of nodes) {
    const list = byZone.get(node.zone) || [];
    list.push(node);
    byZone.set(node.zone, list);
  }

  const preferred = ["kick", "snare", "hihat", "perc"];
  const result: SampleNode[] = [];
  const usedIds = new Set<string>();
  for (const zone of preferred) {
    const list = byZone.get(zone)?.filter((n) => !usedIds.has(n.id));
    if (list && list.length > 0) {
      const pick = list[Math.floor(Math.random() * list.length)];
      result.push(pick);
      usedIds.add(pick.id);
    }
  }

  // Fallback: if no zones matched, pick up to 4 random nodes
  if (result.length === 0) {
    const shuffled = [...nodes].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }

  return result;
}

function DebugPanel() {
  const [pos, setPos] = createSignal({ x: 16, y: 48 });
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const onMouseDown = (e: MouseEvent) => {
    dragging = true;
    offsetX = e.clientX - pos().x;
    offsetY = e.clientY - pos().y;
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    setPos({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  };

  const onMouseUp = () => { dragging = false; };

  onMount(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
  onCleanup(() => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  });

  return (
    <div
      style={{
        position: "fixed",
        left: `${pos().x}px`,
        top: `${pos().y}px`,
        "z-index": "50",
        width: "220px",
        background: "rgba(16,18,24,0.95)",
        border: "1px solid rgba(255,255,255,0.1)",
        "border-radius": "8px",
        "box-shadow": "0 8px 32px rgba(0,0,0,0.6)",
        "backdrop-filter": "blur(16px)",
        "-webkit-backdrop-filter": "blur(16px)",
        "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        "user-select": "none",
      }}
    >
      {/* Draggable header */}
      <div
        onMouseDown={onMouseDown}
        style={{
          padding: "8px 12px",
          cursor: "grab",
          display: "flex",
          "align-items": "center",
          "border-bottom": "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span
          style={{
            "font-size": "0.65rem",
            "font-weight": "600",
            "letter-spacing": "0.08em",
            "text-transform": "uppercase",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          Debug
        </span>
      </div>
      {/* Options */}
      <div style={{ padding: "8px 12px" }}>
        <label
          style={{
            display: "flex",
            "align-items": "center",
            gap: "8px",
            cursor: "pointer",
            "font-size": "0.7rem",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <input
            type="checkbox"
            checked={showZoneBorders()}
            onChange={(e) => {
              setShowZoneBorders(e.currentTarget.checked);
              const eng = engine();
              if (eng) eng.showZoneBorders = e.currentTarget.checked;
            }}
            style={{
              width: "14px",
              height: "14px",
              "accent-color": "rgba(100,225,225,1)",
              cursor: "pointer",
            }}
          />
          Show zone borders
        </label>
      </div>
    </div>
  );
}

export default function App() {
  let canvasRef!: HTMLCanvasElement;
  let seqRef!: HTMLDivElement;
  let seqHeight = 0;

  onMount(() => {
    const e = new SampleMapEngine(canvasRef);
    setEngine(e);
    e.topMargin = HEADER_HEIGHT;
    e.onSampleCount = (n) => setSampleCount(n);
    e.onNodeSelect = (node) => {
      const idx = armedTrack();
      if (idx < 0) return;
      if (node) {
        const current = seqSamples();
        if (current.some((s, i) => i !== idx && s.id === node.id)) return;
        setSeqSamples((prev) => {
          const next = [...prev];
          next[idx] = node;
          return next;
        });
        // Update highlighted set
        const updated = seqSamples().map((s) => s.id);
        e.highlightedNodeIds = new Set(updated);
      } else {
        // Clicked empty space — disarm
        setArmedTrack(-1);
      }
    };
    e.render();

    // Reactively set excludeNodeIds when a track is armed (duplicate prevention)
    createEffect(() => {
      const eng = engine();
      if (!eng) return;
      const idx = armedTrack();
      if (idx < 0) {
        eng.excludeNodeIds = null;
      } else {
        const samples = seqSamples();
        const excluded = new Set<string>();
        for (let i = 0; i < samples.length; i++) {
          if (i !== idx) excluded.add(samples[i].id);
        }
        eng.excludeNodeIds = excluded;
      }
    });

    const handleResize = () => {
      const eng = engine();
      if (eng) {
        eng.resize();
        if (!eng.playing) eng.render();
      }
    };
    const heldArrows = new Set<string>();
    const opposingKey: Record<string, string> = {
      ArrowUp: "ArrowDown", ArrowDown: "ArrowUp",
      ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft",
    };
    const repeatTimers = new Map<string, ReturnType<typeof setInterval>>();
    const REPEAT_DELAY = 160;  // ms before repeat starts
    const REPEAT_RATE = 80;    // ms between repeats

    const fireArrow = (key: string) => {
      if (heldArrows.has(opposingKey[key])) return;
      const dir = key.replace("Arrow", "").toLowerCase() as "up" | "down" | "left" | "right";
      engine()?.onArrowKey(dir);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        engine()?.onEscape();
        return;
      }
      if (e.key === " " && seqActive()) {
        e.preventDefault();
        setSeqPlaying(!seqPlaying());
        return;
      }
      if (e.key in opposingKey) {
        e.preventDefault();
        if (e.repeat) return; // ignore OS repeat, we handle our own
        heldArrows.add(e.key);
        fireArrow(e.key);
        // Start custom repeat: initial delay, then fast interval
        clearInterval(repeatTimers.get(e.key));
        const timer = setTimeout(() => {
          const iv = setInterval(() => fireArrow(e.key), REPEAT_RATE);
          repeatTimers.set(e.key, iv as any);
        }, REPEAT_DELAY);
        repeatTimers.set(e.key, timer as any);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      heldArrows.delete(e.key);
      const timer = repeatTimers.get(e.key);
      if (timer != null) {
        clearInterval(timer);
        clearTimeout(timer);
        repeatTimers.delete(e.key);
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Track sequencer height via ResizeObserver
    const seqObserver = new ResizeObserver(() => {
      seqHeight = seqRef.offsetHeight;
      const eng = engine();
      if (eng && seqActive()) {
        eng.bottomMargin = seqHeight;
        eng.zoomToFit();
      }
    });
    seqObserver.observe(seqRef);

    // Fetch samples from server
    fetchSamples();

    onCleanup(() => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      seqObserver.disconnect();
      engine()?.stop();
    });
  });

  const fetchSamples = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/samples");
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Server error" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const samples = await res.json();
      const eng = engine()!;
      eng.loadSamples(samples);
      eng.zoomToFit();
      eng.start();
      // Pick sequencer samples once on first load
      if (seqSamples().length === 0) {
        setSeqSamples(pickSequencerSamples(eng.nodes));
      }
      setLoading(false);
      // Fetch user presets (non-blocking, non-critical)
      fetchPresets();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch samples";
      setError(message);
      setLoading(false);
    }
  };

  const fetchPresets = async () => {
    try {
      const res = await fetch("/api/presets");
      if (res.ok) {
        const data = await res.json();
        setPresets(data);
      }
    } catch { /* silently ignore */ }
  };

  const toggleSeq = () => {
    const next = !seqActive();
    setSeqActive(next);
    const eng = engine();
    if (eng) {
      eng.highlightedNodeIds = next
        ? new Set(seqSamples().map((s) => s.id))
        : null;
      eng.bottomMargin = next ? seqHeight : 0;
      eng.zoomToFit();
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        background: "#000408",
      }}
    >
      {/* Canvas — always fills viewport */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: "0",
          display: "block",
          width: "100%",
          height: "100%",
          cursor: "grab",
        }}
        onMouseDown={(e) => {
          engine()?.onPointerDown(e.clientX, e.clientY);
          e.currentTarget.style.cursor = "grabbing";
        }}
        onMouseMove={(e) => engine()?.onPointerMove(e.clientX, e.clientY)}
        onMouseUp={(e) => {
          engine()?.onPointerUp(e.clientX, e.clientY);
          e.currentTarget.style.cursor = "grab";
        }}
        onMouseLeave={() => engine()?.onPointerLeave()}
        onWheel={(e) => {
          e.preventDefault();
          engine()?.onWheel(e.deltaY, e.clientX, e.clientY);
        }}
      />

      {/* Header — absolute overlay */}
      <div
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          engine()?.onEscape();
          setArmedTrack(-1);
        }}
        style={{
          position: "absolute",
          top: "0",
          left: "0",
          right: "0",
          height: `${HEADER_HEIGHT}px`,
          display: "flex",
          "align-items": "center",
          background: "linear-gradient(180deg, rgba(12,14,18,0.92) 0%, rgba(8,10,14,0.88) 100%)",
          "border-bottom": "1px solid rgba(255,255,255,0.06)",
          "box-shadow": "0 1px 8px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.03)",
          "backdrop-filter": "blur(12px)",
          "-webkit-backdrop-filter": "blur(12px)",
          padding: "0 12px",
          "z-index": "20",
          gap: "12px",
          "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          "user-select": "none",
        }}
      >
        <span
          style={{
            "font-size": "0.74rem",
            "font-weight": "600",
            "letter-spacing": "0.03em",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          SampleMap
        </span>

        {/* Separator */}
        <div style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.08)" }} />

        <button
          onClick={toggleSeq}
          style={{
            background: "none",
            border: "none",
            padding: "0 6px",
            height: `${HEADER_HEIGHT}px`,
            "font-size": "0.66rem",
            "font-weight": "500",
            "letter-spacing": "0.08em",
            "text-transform": "uppercase",
            color: seqActive() ? "rgba(100,225,225,1)" : "rgba(255,255,255,0.5)",
            cursor: "pointer",
            "font-family": "inherit",
            "border-bottom": seqActive() ? "2px solid rgba(100,225,225,0.9)" : "2px solid transparent",
            "box-shadow": "none",
            transition: "color 0.2s, border-color 0.2s",
            "margin-bottom": "-1px",
            outline: "none",
            "-webkit-tap-highlight-color": "transparent",
          }}
        >
          seq
        </button>

        <button
          onClick={() => setDebugActive(!debugActive())}
          style={{
            background: "none",
            border: "none",
            padding: "0 6px",
            height: `${HEADER_HEIGHT}px`,
            "font-size": "0.66rem",
            "font-weight": "500",
            "letter-spacing": "0.08em",
            "text-transform": "uppercase",
            color: debugActive() ? "rgba(100,225,225,1)" : "rgba(255,255,255,0.5)",
            cursor: "pointer",
            "font-family": "inherit",
            "border-bottom": debugActive() ? "2px solid rgba(100,225,225,0.9)" : "2px solid transparent",
            "box-shadow": "none",
            transition: "color 0.2s, border-color 0.2s",
            "margin-bottom": "-1px",
            outline: "none",
            "-webkit-tap-highlight-color": "transparent",
          }}
        >
          debug
        </button>
      </div>

      {/* Debug panel */}
      <Show when={debugActive()}>
        <DebugPanel />
      </Show>

      {/* Loading overlay */}
      <Show when={loading()}>
        <div
          style={{
            position: "absolute",
            inset: "0",
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            "justify-content": "center",
            background: "radial-gradient(ellipse at center, rgba(5,10,25,0.85) 0%, rgba(0,2,8,0.95) 70%)",
            "z-index": "10",
          }}
        >
          <h1
            style={{
              "font-size": "2.5rem",
              "font-weight": "200",
              "letter-spacing": "0.2em",
              color: "rgba(255,255,255,0.85)",
              margin: "0 0 4px 0",
              "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            SAMPLE MAP
          </h1>
          <p
            style={{
              color: "rgba(255,255,255,0.4)",
              "font-family": "monospace",
              "font-size": "0.8rem",
            }}
          >
            Extracting features &amp; computing t-SNE...
          </p>
        </div>
      </Show>

      {/* Error overlay */}
      <Show when={error()}>
        <div
          style={{
            position: "absolute",
            inset: "0",
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            "justify-content": "center",
            background: "radial-gradient(ellipse at center, rgba(5,10,25,0.85) 0%, rgba(0,2,8,0.95) 70%)",
            "z-index": "10",
          }}
        >
          <h1
            style={{
              "font-size": "2.5rem",
              "font-weight": "200",
              "letter-spacing": "0.2em",
              color: "rgba(255,255,255,0.85)",
              margin: "0 0 4px 0",
              "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            SAMPLE MAP
          </h1>
          <p
            style={{
              color: "rgba(239,68,68,0.8)",
              "font-family": "monospace",
              "font-size": "0.85rem",
              margin: "0 0 20px 0",
            }}
          >
            {error()}
          </p>
          <button
            onClick={fetchSamples}
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.5)",
              padding: "8px 24px",
              "font-size": "0.75rem",
              "font-family": "monospace",
              cursor: "pointer",
              "border-radius": "3px",
              "letter-spacing": "0.1em",
            }}
          >
            RETRY
          </button>
        </div>
      </Show>

      {/* Sequencer panel — overlays from bottom, slides up via CSS transform */}
      <div
        ref={seqRef}
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          right: "0",
          "z-index": "20",
          transform: seqActive() ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <Sequencer />
      </div>

      {/* Adaptation modal */}
      <Show when={showAdaptModal()}>
        {(modal) => (
          <div
            style={{
              position: "absolute",
              inset: "0",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: "rgba(0,0,0,0.6)",
              "backdrop-filter": "blur(8px)",
              "-webkit-backdrop-filter": "blur(8px)",
              "z-index": "100",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowAdaptModal(null); }}
          >
            <div
              style={{
                width: "380px",
                background: "rgba(16,18,24,0.97)",
                border: "1px solid rgba(255,255,255,0.1)",
                "border-radius": "12px",
                "box-shadow": "0 16px 48px rgba(0,0,0,0.7)",
                "backdrop-filter": "blur(20px)",
                "-webkit-backdrop-filter": "blur(20px)",
                padding: "24px",
                "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            >
              <h3
                style={{
                  margin: "0 0 12px 0",
                  "font-size": "0.9rem",
                  "font-weight": "600",
                  color: "rgba(255,255,255,0.9)",
                }}
              >
                Adaptation Required
              </h3>
              <p
                style={{
                  margin: "0 0 20px 0",
                  "font-size": "0.76rem",
                  "line-height": "1.5",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                This preset references samples not in your current bank. It will
                be loaded using similar samples from your library — the original
                preset won't be modified.
              </p>
              <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
                <button
                  onClick={() => setShowAdaptModal(null)}
                  style={{
                    height: "32px",
                    padding: "0 16px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    "border-radius": "6px",
                    color: "rgba(255,255,255,0.6)",
                    "font-size": "0.72rem",
                    cursor: "pointer",
                    "font-family": "inherit",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const fn = applyPresetFn();
                    if (fn) fn(modal().preset, true);
                    setShowAdaptModal(null);
                  }}
                  style={{
                    height: "32px",
                    padding: "0 16px",
                    background: "rgba(100,225,225,0.15)",
                    border: "1px solid rgba(100,225,225,0.3)",
                    "border-radius": "6px",
                    color: "rgba(100,225,225,1)",
                    "font-size": "0.72rem",
                    "font-weight": "600",
                    cursor: "pointer",
                    "font-family": "inherit",
                  }}
                >
                  Load with My Samples
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
