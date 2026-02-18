import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { SampleMapEngine } from "./engine";
import type { SampleNode } from "./engine";
import Sequencer from "./Sequencer";


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
  let engine: SampleMapEngine | null = null;

  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [sampleCount, setSampleCount] = createSignal(0);
  const [seqActive, setSeqActive] = createSignal(false);
  const [seqSamples, setSeqSamples] = createSignal<SampleNode[]>([]);
  const [armedTrack, setArmedTrack] = createSignal(-1);

  onMount(() => {
    engine = new SampleMapEngine(canvasRef);
    engine.onSampleCount = (n) => setSampleCount(n);
    engine.onNodeSelect = (node) => {
      const idx = armedTrack();
      if (idx < 0) return;
      if (node) {
        setSeqSamples((prev) => {
          const next = [...prev];
          next[idx] = node;
          return next;
        });
        // Update highlighted set
        if (engine) {
          const updated = seqSamples().map((s) => s.id);
          engine.highlightedNodeIds = new Set(updated);
        }
      } else {
        // Clicked empty space — disarm
        setArmedTrack(-1);
      }
    };
    engine.render();

    const handleResize = () => {
      if (engine) {
        engine.resize();
        if (!engine.playing) engine.render();
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
      engine?.onArrowKey(dir);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        engine?.onEscape();
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

    // Fetch samples from server
    fetchSamples();

    onCleanup(() => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      engine?.stop();
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
      engine!.loadSamples(samples);
      engine!.start();
      // Pick sequencer samples once on first load
      if (seqSamples().length === 0) {
        setSeqSamples(pickSequencerSamples(engine!.nodes));
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
    // Set/clear dimming on the engine
    if (engine) {
      engine.highlightedNodeIds = next
        ? new Set(seqSamples().map((s) => s.id))
        : null;
    }
    // Resize canvas on next frame after DOM updates
    requestAnimationFrame(() => {
      if (engine) {
        engine.resize();
        if (next) engine.zoomToFit();
        if (!engine.playing) engine.render();
      }
    });
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden",
        background: "#000408",
      }}
    >
      {/* Canvas area — grows to fill remaining space */}
      <div
        style={{
          flex: "1",
          "min-height": "0",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header — absolute overlay within canvas area */}
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

        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            cursor: "grab",
          }}
          onMouseDown={(e) => {
            engine?.onPointerDown(e.clientX, e.clientY);
            e.currentTarget.style.cursor = "grabbing";
          }}
          onMouseMove={(e) => engine?.onPointerMove(e.clientX, e.clientY)}
          onMouseUp={(e) => {
            engine?.onPointerUp(e.clientX, e.clientY);
            e.currentTarget.style.cursor = "grab";
          }}
          onMouseLeave={() => engine?.onPointerLeave()}
          onWheel={(e) => {
            e.preventDefault();
            engine?.onWheel(e.deltaY, e.clientX, e.clientY);
          }}
        />

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
      </div>

      {/* Sequencer panel — in normal flow, pushes canvas up */}
      <Show when={seqActive()}>
        <Sequencer
          samples={seqSamples()}
          onTrigger={(node: SampleNode) => {
            node.glow = 1;
            engine?.playSample(node, true);
          }}
          onRandomize={() => {
            if (!engine) return;
            const count = seqSamples().length;
            const pool = [...engine.nodes];
            const next: SampleNode[] = [];
            for (let i = 0; i < count && pool.length > 0; i++) {
              const idx = Math.floor(Math.random() * pool.length);
              next.push(pool.splice(idx, 1)[0]);
            }
            setSeqSamples(next);
            engine.highlightedNodeIds = new Set(next.map((s) => s.id));
          }}
          onAddTrack={() => {
            if (!engine || engine.nodes.length === 0) return;
            const usedIds = new Set(seqSamples().map((s) => s.id));
            const available = engine.nodes.filter((n) => !usedIds.has(n.id));
            const pool = available.length > 0 ? available : engine.nodes;
            const sample = pool[Math.floor(Math.random() * pool.length)];
            setSeqSamples((prev) => [...prev, sample]);
            // Update highlight set
            engine.highlightedNodeIds = new Set([...seqSamples().map((s) => s.id), sample.id]);
            // Arm the new track so user can immediately reassign
            setArmedTrack(seqSamples().length - 1);
            // Resize canvas since sequencer grew
            requestAnimationFrame(() => {
              engine?.resize();
              if (engine && !engine.playing) engine.render();
            });
          }}
          onFocusSample={(node: SampleNode) => engine?.focusNode(node)}
          armedTrack={armedTrack()}
          onArmTrack={setArmedTrack}
        />
      </Show>
    </div>
  );
}
