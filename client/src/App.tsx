import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { SampleMapEngine } from "./engine";


export default function App() {
  let canvasRef!: HTMLCanvasElement;
  let engine: SampleMapEngine | null = null;

  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [sampleCount, setSampleCount] = createSignal(0);

  onMount(() => {
    engine = new SampleMapEngine(canvasRef);
    engine.onSampleCount = (n) => setSampleCount(n);
    engine.render();

    const handleResize = () => {
      if (engine) {
        engine.resize();
        if (!engine.playing) engine.render();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        engine?.onEscape();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        engine?.onArrowKey("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        engine?.onArrowKey("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        engine?.onArrowKey("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        engine?.onArrowKey("right");
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);

    // Fetch samples from server
    fetchSamples();

    onCleanup(() => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
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
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch samples";
      setError(message);
      setLoading(false);
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
        onMouseLeave={() => engine?.onPointerUp()}
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
  );
}
