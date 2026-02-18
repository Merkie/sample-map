import { onMount, onCleanup, Show } from "solid-js";
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
} from "./state";


const HEADER_HEIGHT = 30;

/** Pick one random sample from each of up to 4 distinct categories */
function pickSequencerSamples(nodes: SampleNode[]): SampleNode[] {
  const byCategory = new Map<string, SampleNode[]>();
  for (const node of nodes) {
    const list = byCategory.get(node.category) || [];
    list.push(node);
    byCategory.set(node.category, list);
  }

  // Take up to 4 categories
  const categories = [...byCategory.keys()].slice(0, 4);
  return categories.map((cat) => {
    const list = byCategory.get(cat)!;
    return list[Math.floor(Math.random() * list.length)];
  });
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch samples";
      setError(message);
      setLoading(false);
    }
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
      </div>

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
    </div>
  );
}
