import { onMount, onCleanup, Show, createSignal, createEffect } from "solid-js";
import { SampleMapEngine } from "./engine";
import type { SampleNode } from "./engine";
import Sequencer from "./Sequencer";
import { cn } from "./lib/cn";
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
  physicsEnabled, setPhysicsEnabled,
  setPresets,
  showAdaptModal, setShowAdaptModal,
  applyPresetFn,
  audioUnlocked, setAudioUnlocked,
  resetSeqTracks,
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
      class="fixed z-50 w-[220px] bg-panel/95 border border-white/10 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-lg select-none"
      style={{ left: `${pos().x}px`, top: `${pos().y}px` }}
    >
      {/* Draggable header */}
      <div
        onMouseDown={onMouseDown}
        class="px-3 py-2 cursor-grab flex items-center border-b border-white/[0.06]"
      >
        <span class="text-[0.65rem] font-semibold tracking-wider uppercase text-white/50">
          Debug
        </span>
      </div>
      {/* Options */}
      <div class="px-3 py-2">
        <label class="flex items-center gap-2 cursor-pointer text-[0.7rem] text-white/70">
          <input
            type="checkbox"
            checked={showZoneBorders()}
            onChange={(e) => {
              setShowZoneBorders(e.currentTarget.checked);
              const eng = engine();
              if (eng) eng.showZoneBorders = e.currentTarget.checked;
            }}
            class="w-3.5 h-3.5 accent-accent cursor-pointer"
          />
          Show zone borders
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-[0.7rem] text-white/70 mt-1.5">
          <input
            type="checkbox"
            checked={physicsEnabled()}
            onChange={(e) => {
              const enabled = e.currentTarget.checked;
              setPhysicsEnabled(enabled);
              const eng = engine();
              if (eng) eng.setPhysicsEnabled(enabled);
            }}
            class="w-3.5 h-3.5 accent-accent cursor-pointer"
          />
          d3-force physics
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
      if (!node) {
        if (armedTrack() >= 0) setArmedTrack(-1);
        return;
      }

      if (seqActive()) {
        const samples = seqSamples();
        const trackIdx = samples.findIndex(s => s.id === node.id);
        if (trackIdx >= 0) {
          setArmedTrack(trackIdx);
          return;
        }
      }

      const idx = armedTrack();
      if (idx < 0) return;
      const current = seqSamples();
      if (current.some((s, i) => i !== idx && s.id === node.id)) return;
      setSeqSamples((prev) => {
        const next = [...prev];
        next[idx] = node;
        return next;
      });
      const updated = seqSamples().map((s) => s.id);
      e.highlightedNodeIds = new Set(updated);
    };
    e.render();

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
    const REPEAT_DELAY = 160;
    const REPEAT_RATE = 80;

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
      if (e.key === " " && seqActive() && !(document.activeElement instanceof HTMLInputElement)) {
        e.preventDefault();
        setSeqPlaying(!seqPlaying());
        return;
      }
      if (e.key in opposingKey) {
        e.preventDefault();
        if (e.repeat) return;
        heldArrows.add(e.key);
        fireArrow(e.key);
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

    // ===== Touch input (pinch-to-zoom + single-finger pan) =====
    let lastPinchDist = 0;
    let lastMidX = 0;
    let lastMidY = 0;
    let wasPinching = false;

    const onTouchStart = (ev: TouchEvent) => {
      ev.preventDefault();
      const eng = engine();
      if (!eng) return;
      eng.touchActive = true;
      eng.isTouchDevice = true;

      if (ev.touches.length === 2) {
        // Cancel any single-finger drag and dismiss selection ring
        if (!wasPinching) eng.onPointerUp();
        if (eng.selectionRing.active) eng.onEscape();
        wasPinching = true;

        const t0 = ev.touches[0];
        const t1 = ev.touches[1];
        lastPinchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        lastMidX = (t0.clientX + t1.clientX) / 2;
        lastMidY = (t0.clientY + t1.clientY) / 2;
      } else if (ev.touches.length === 1 && !wasPinching) {
        eng.onPointerDown(ev.touches[0].clientX, ev.touches[0].clientY);
      }
    };

    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const eng = engine();
      if (!eng) return;

      if (ev.touches.length === 2) {
        const t0 = ev.touches[0];
        const t1 = ev.touches[1];
        const newDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const newMidX = (t0.clientX + t1.clientX) / 2;
        const newMidY = (t0.clientY + t1.clientY) / 2;

        if (lastPinchDist > 0) {
          const factor = newDist / lastPinchDist;
          eng.onPinchMove(lastMidX, lastMidY, newMidX, newMidY, factor);
        }

        lastPinchDist = newDist;
        lastMidX = newMidX;
        lastMidY = newMidY;
      } else if (ev.touches.length === 1 && !wasPinching) {
        eng.onPointerMove(ev.touches[0].clientX, ev.touches[0].clientY);
      }
    };

    const onTouchEnd = (ev: TouchEvent) => {
      ev.preventDefault();
      const eng = engine();
      if (!eng) return;

      if (ev.touches.length === 0) {
        // All fingers lifted
        if (wasPinching) {
          wasPinching = false;
          lastPinchDist = 0;
        } else {
          eng.onPointerUp(ev.changedTouches[0]?.clientX, ev.changedTouches[0]?.clientY);
        }
        eng.touchActive = false;
      } else if (ev.touches.length === 1 && wasPinching) {
        // Went from 2 fingers to 1 — don't start a new pan, wait for full release
        lastPinchDist = 0;
      }
    };

    const onWheelEvent = (ev: WheelEvent) => {
      ev.preventDefault();
      engine()?.onWheel(ev.deltaY, ev.clientX, ev.clientY);
    };

    canvasRef.addEventListener("wheel", onWheelEvent, { passive: false });
    canvasRef.addEventListener("touchstart", onTouchStart, { passive: false });
    canvasRef.addEventListener("touchmove", onTouchMove, { passive: false });
    canvasRef.addEventListener("touchend", onTouchEnd, { passive: false });
    canvasRef.addEventListener("touchcancel", onTouchEnd, { passive: false });

    const canvasObserver = new ResizeObserver(handleResize);
    canvasObserver.observe(canvasRef);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const seqObserver = new ResizeObserver(() => {
      seqHeight = seqRef.offsetHeight;
      const eng = engine();
      if (eng && seqActive()) {
        eng.bottomMargin = seqHeight;
        eng.zoomToFit();
      }
    });
    seqObserver.observe(seqRef);

    fetchSamples();

    onCleanup(() => {
      canvasRef.removeEventListener("wheel", onWheelEvent);
      canvasRef.removeEventListener("touchstart", onTouchStart);
      canvasRef.removeEventListener("touchmove", onTouchMove);
      canvasRef.removeEventListener("touchend", onTouchEnd);
      canvasRef.removeEventListener("touchcancel", onTouchEnd);
      canvasObserver.disconnect();
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
      if (seqSamples().length === 0) {
        resetSeqTracks(pickSequencerSamples(eng.nodes));
      }
      setLoading(false);
      loadPresets();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch samples";
      setError(message);
      setLoading(false);
    }
  };

  const loadPresets = () => {
    try {
      const raw = localStorage.getItem("sample-map-presets");
      if (raw) setPresets(JSON.parse(raw));
    } catch { /* silently ignore */ }
  };

  const toggleSeq = () => {
    const next = !seqActive();
    setSeqActive(next);
    if (!next) {
      setSeqPlaying(false);
    }
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
    <div class="w-screen h-dvh relative overflow-hidden bg-base">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        class="absolute inset-0 block w-full h-full cursor-grab"
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
      />

      {/* Header — hidden behind click-to-start overlay */}
      <div
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          engine()?.onEscape();
          setArmedTrack(-1);
        }}
        class={cn(
          "absolute top-0 inset-x-0 flex items-center z-20 gap-3 px-3 select-none border-b border-white/[0.06] backdrop-blur-md transition-opacity duration-300",
          !audioUnlocked() ? "opacity-0 pointer-events-none" : "opacity-100",
        )}
        style={{
          height: `${HEADER_HEIGHT}px`,
          background: "linear-gradient(180deg, rgba(12,14,18,0.92) 0%, rgba(8,10,14,0.88) 100%)",
          "box-shadow": "0 1px 8px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <span class="text-[0.74rem] font-semibold tracking-wide text-white/55">
          SampleMap
        </span>

        <div class="w-px h-3 bg-white/[0.08]" />

        <button
          onClick={toggleSeq}
          class={cn(
            "bg-transparent border-0 border-b-2 px-1.5 text-[0.66rem] font-medium tracking-wider uppercase",
            "cursor-pointer transition-colors duration-200 -mb-px outline-none",
            seqActive()
              ? "text-accent border-b-accent/90"
              : "text-white/50 border-b-transparent",
          )}
          style={{ height: `${HEADER_HEIGHT}px` }}
        >
          seq
        </button>

        <button
          onClick={() => setDebugActive(!debugActive())}
          class={cn(
            "bg-transparent border-0 border-b-2 px-1.5 text-[0.66rem] font-medium tracking-wider uppercase",
            "cursor-pointer transition-colors duration-200 -mb-px outline-none",
            debugActive()
              ? "text-accent border-b-accent/90"
              : "text-white/50 border-b-transparent",
          )}
          style={{ height: `${HEADER_HEIGHT}px` }}
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
          class="absolute inset-0 flex flex-col items-center justify-center z-10"
          style={{ background: "radial-gradient(ellipse at center, rgba(5,10,25,0.85) 0%, rgba(0,2,8,0.95) 70%)" }}
        >
          <h1 class="text-[2.5rem] font-extralight tracking-[0.2em] text-white/85 mb-1">
            SAMPLE MAP
          </h1>
          <p class="text-white/40 font-mono text-[0.8rem]">
            Extracting features &amp; computing t-SNE...
          </p>
        </div>
      </Show>

      {/* Click-to-start overlay */}
      <Show when={!loading() && !error() && !audioUnlocked()}>
        <div
          onClick={() => {
            const eng = engine();
            if (eng) eng.ensureAudioCtx();
            setAudioUnlocked(true);
          }}
          class="absolute inset-0 flex flex-col items-center justify-center z-10 cursor-pointer"
          style={{ background: "radial-gradient(ellipse at center, rgba(5,10,25,0.85) 0%, rgba(0,2,8,0.95) 70%)" }}
        >
          <h1 class="text-[2.5rem] font-extralight tracking-[0.2em] text-white/85 mb-4">
            SAMPLE MAP
          </h1>
          <p
            class="text-white/40 font-mono text-[0.85rem]"
            style={{ animation: "pulse 2s ease-in-out infinite" }}
          >
            Click anywhere to start
          </p>
        </div>
      </Show>

      {/* Error overlay */}
      <Show when={error()}>
        <div
          class="absolute inset-0 flex flex-col items-center justify-center z-10"
          style={{ background: "radial-gradient(ellipse at center, rgba(5,10,25,0.85) 0%, rgba(0,2,8,0.95) 70%)" }}
        >
          <h1 class="text-[2.5rem] font-extralight tracking-[0.2em] text-white/85 mb-1">
            SAMPLE MAP
          </h1>
          <p class="text-red-500/80 font-mono text-[0.85rem] mb-5">
            {error()}
          </p>
          <button
            onClick={fetchSamples}
            class="bg-transparent border border-white/15 text-white/50 px-6 py-2 text-[0.75rem] font-mono cursor-pointer rounded-sm tracking-wider"
          >
            RETRY
          </button>
        </div>
      </Show>

      {/* Sequencer panel */}
      <div
        ref={seqRef}
        class="absolute bottom-0 inset-x-0 z-20 transition-transform duration-[350ms] ease-in-out"
        style={{ transform: seqActive() ? "translateY(0)" : "translateY(100%)" }}
      >
        <Sequencer />
      </div>

      {/* Adaptation modal */}
      <Show when={showAdaptModal()}>
        {(modal) => (
          <div
            class="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur z-[100]"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAdaptModal(null); }}
          >
            <div class="w-[380px] bg-panel/[0.97] border border-white/10 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-xl p-6">
              <h3 class="mb-3 text-[0.9rem] font-semibold text-white/90">
                Adaptation Required
              </h3>
              <p class="mb-5 text-[0.76rem] leading-relaxed text-white/55">
                This preset references samples not in your current bank. It will
                be loaded using similar samples from your library — the original
                preset won't be modified.
              </p>
              <div class="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAdaptModal(null)}
                  class="h-8 px-4 bg-white/[0.06] border border-white/10 rounded-md text-white/60 text-[0.72rem] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const fn = applyPresetFn();
                    if (fn) fn(modal().preset, true);
                    setShowAdaptModal(null);
                  }}
                  class="h-8 px-4 bg-accent/15 border border-accent/30 rounded-md text-accent text-[0.72rem] font-semibold cursor-pointer"
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
