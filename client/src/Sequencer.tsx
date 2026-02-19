import { createSignal, createEffect, onCleanup, createMemo, For, Show, untrack } from "solid-js";
import { CircleDashed, CircleDotDashed, Dices, GripVertical, Library, Lock, LockOpen, Plus, Save, X } from "lucide-solid";
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
import { cn } from "./lib/cn";
import {
  STEPS_PER_BAR, TOTAL_STEPS,
  engine, seqActive, seqSamples, setSeqSamples, armedTrack, setArmedTrack,
  seqPlaying, setSeqPlaying, seqBpm, setSeqBpm, seqSwing, setSeqSwing, seqBars, setSeqBars,
  presets, setPresets, setShowAdaptModal, setApplyPresetFn,
  seqGrid, setSeqGrid, seqStep, setSeqStep,
  seqLockedTracks, setSeqLockedTracks,
  seqTrackVolumes, setSeqTrackVolumes,
  seqScatterEnabled, setSeqScatterEnabled,
  seqScatterRadius, setSeqScatterRadius,
  addSeqTrack, removeSeqTrack,
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
  const [confirmDeleteTrack, setConfirmDeleteTrack] = createSignal(-1);
  const sortableIds = createMemo(() => tracks().map((t) => t.id));
  let gridScrollRef: HTMLDivElement | undefined;
  let presetsBtnRef: HTMLButtonElement | undefined;
  let saveBtnRef: HTMLButtonElement | undefined;

  const popoverLeft = (btn: HTMLButtonElement | undefined, popoverWidth: number) => {
    const rect = btn?.getBoundingClientRect();
    if (!rect) return 0;
    const left = rect.left;
    const overflow = left + popoverWidth - window.innerWidth + 8;
    return overflow > 0 ? left - overflow : left;
  };

  const handleDeleteTrack = (idx: number) => {
    const hasNotes = seqGrid()[idx]?.some((v) => v);
    if (hasNotes) {
      setConfirmDeleteTrack(idx);
    } else {
      doDeleteTrack(idx);
    }
  };

  const doDeleteTrack = (idx: number) => {
    const armed = armedTrack();
    removeSeqTrack(idx);
    if (armed === idx) setArmedTrack(-1);
    else if (armed > idx) setArmedTrack(armed - 1);
    const eng = engine();
    if (eng) eng.highlightedNodeIds = new Set(seqSamples().map((s) => s.id));
    setConfirmDeleteTrack(-1);
  };

  // Auto-scroll to keep playhead visible during playback
  createEffect(() => {
    const step = seqStep();
    if (step < 0 || !gridScrollRef) return;
    const stepWidth = 30;
    const barGap = 6;
    const barsBeforeStep = Math.floor(step / STEPS_PER_BAR);
    const stepLeft = step * (stepWidth + 3) + barsBeforeStep * barGap;
    const stickyWidth = 148;
    const viewLeft = gridScrollRef.scrollLeft;
    const viewWidth = gridScrollRef.clientWidth - stickyWidth;
    if (stepLeft < viewLeft || stepLeft + stepWidth > viewLeft + viewWidth) {
      gridScrollRef.scrollTo({ left: Math.max(0, stepLeft - 60), behavior: "smooth" });
    }
  });

  const applyPreset = (preset: SavedPreset, adapt: boolean) => {
    const eng = engine();
    if (!eng) return;

    const usedIds = new Set<string>();
    const resolvedSamples: SampleNode[] = [];
    const newGrid: boolean[][] = [];

    for (const track of preset.tracks) {
      let node: SampleNode | undefined;

      if (!adapt && track.samplePath) {
        node = eng.nodes.find((n) => n.relativePath === track.samplePath && !usedIds.has(n.id));
      }

      if (!node) {
        const current = seqSamples();
        node = current.find((s) => s.zone === track.sampleCategory && !usedIds.has(s.id));
      }

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
        const padded = [...track.pattern];
        while (padded.length < TOTAL_STEPS) padded.push(false);
        newGrid.push(padded);
      }
    }

    if (resolvedSamples.length > 0) {
      setSeqSamples(resolvedSamples);
      setSeqGrid(newGrid);
      setSeqBpm(preset.bpm);
      setSeqSwing(preset.swing);
      setSeqBars(preset.bars ?? 1);
      setSeqLockedTracks(Array.from({ length: resolvedSamples.length }, () => false));
      setSeqTrackVolumes(preset.tracks.map((t) => t.volume ?? 1.0));
      setSeqScatterEnabled(preset.tracks.map((t) => t.scatter ?? false));
      setSeqScatterRadius(preset.tracks.map((t) => t.scatterRadius ?? 30));
      eng.highlightedNodeIds = new Set(resolvedSamples.map((s) => s.id));
    }
    setShowPresets(false);
  };

  const handleLoadPreset = (preset: SavedPreset) => {
    const eng = engine();
    if (!eng) return;

    let missingCount = 0;
    for (const track of preset.tracks) {
      if (!track.samplePath || !eng.nodes.find((n) => n.relativePath === track.samplePath)) {
        missingCount++;
      }
    }

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

  setApplyPresetFn(() => applyPreset);

  const savePreset = async () => {
    const name = saveName().trim();
    if (!name) return;

    const samples = seqSamples();
    const g = seqGrid();
    const preset: Omit<SavedPreset, "id"> = {
      name,
      bpm: seqBpm(),
      swing: seqSwing(),
      bars: seqBars(),
      tracks: samples.map((s, i) => ({
        samplePath: s.relativePath,
        sampleCategory: s.zone,
        pattern: [...(g[i] || Array(TOTAL_STEPS).fill(false))],
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

  // Sync engine scatter circles from scatter state
  createEffect(() => {
    const eng = engine();
    if (!eng) return;
    const active = seqActive();
    const samples = seqSamples();
    const enabled = seqScatterEnabled();
    const radii = seqScatterRadius();
    const circles: Array<{ nodeId: string; radius: number }> = [];
    if (active) {
      for (let i = 0; i < samples.length; i++) {
        if (enabled[i] && samples[i]) {
          circles.push({ nodeId: samples[i].id, radius: radii[i] ?? 30 });
        }
      }
    }
    eng.scatterCircles = circles;
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
      setSeqStep(0);

      const tick = () => {
        const g = untrack(seqGrid);
        const curBpm = untrack(seqBpm);
        const curSwing = untrack(seqSwing);
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

        const curBars = untrack(seqBars);
        const nextStep = (step + 1) % (curBars * STEPS_PER_BAR);
        const isOdd = step % 2 === 1;
        const stepMs = 60000 / curBpm / 4;
        const swingOffset = stepMs * (curSwing / 100) * 0.33;
        const delay = isOdd ? stepMs - swingOffset : stepMs + swingOffset;

        step = nextStep;
        timerId = setTimeout(tick, delay);
      };

      tick();
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

    setSeqSamples(reorder);
    setSeqGrid((prev) => reorder(prev));
    setSeqLockedTracks((prev) => reorder(prev));
    setSeqTrackVolumes((prev) => reorder(prev));
    setSeqScatterEnabled((prev) => reorder(prev));
    setSeqScatterRadius((prev) => reorder(prev));

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
      class="shrink-0 z-20 select-none flex flex-col pt-2.5 pb-3 border-t border-white/[0.06] backdrop-blur-lg"
      style={{
        background: "linear-gradient(180deg, rgba(16,18,24,0.96) 0%, rgba(10,12,16,0.98) 100%)",
        "box-shadow": "0 -4px 24px rgba(0,0,0,0.6)",
      }}
    >
      {/* Transport bar */}
      <div class="thin-scrollbar flex items-center gap-4 px-4 pb-2 border-b border-white/[0.04] mb-1.5 overflow-x-auto overflow-y-hidden">
        {/* Play / Stop */}
        <button
          onClick={() => setSeqPlaying(!seqPlaying())}
          class={cn(
            "w-7 h-7 border border-white/[0.12] rounded-md cursor-pointer",
            "flex items-center justify-center text-xs shrink-0 transition-all duration-150",
            seqPlaying()
              ? "bg-accent/[0.12] text-accent"
              : "bg-white/[0.04] text-white/60",
          )}
        >
          <Show
            when={seqPlaying()}
            fallback={
              <div
                class="ml-0.5"
                style={{
                  width: "0",
                  height: "0",
                  "border-left": "9px solid currentColor",
                  "border-top": "6px solid transparent",
                  "border-bottom": "6px solid transparent",
                }}
              />
            }
          >
            <div class="w-2.5 h-2.5 rounded-sm bg-current" />
          </Show>
        </button>

        {/* BPM */}
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="text-[0.62rem] font-medium tracking-wider uppercase text-white/35">
            BPM
          </span>
          <input
            type="number"
            value={seqBpm()}
            min={40}
            max={300}
            onInput={(e) => setSeqBpm(parseInt(e.currentTarget.value) || 120)}
            class="w-12 h-6 bg-white/5 border border-white/10 rounded text-white/80 text-[0.72rem] font-mono text-center outline-none"
          />
        </div>

        {/* Bars */}
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="text-[0.62rem] font-medium tracking-wider uppercase text-white/35">
            Bars
          </span>
          <input
            type="number"
            value={seqBars()}
            min={1}
            max={8}
            onInput={(e) => {
              const v = parseInt(e.currentTarget.value);
              if (v >= 1 && v <= 8) setSeqBars(v);
            }}
            class="w-9 h-6 bg-white/5 border border-white/10 rounded text-white/80 text-[0.72rem] font-mono text-center outline-none"
          />
        </div>

        {/* Swing */}
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="text-[0.62rem] font-medium tracking-wider uppercase text-white/35">
            Swing
          </span>
          <div class="relative w-20 h-6 flex items-center">
            <input
              class="swing-slider w-full h-1 appearance-none rounded-sm outline-none cursor-pointer"
              type="range"
              min={0}
              max={100}
              value={seqSwing()}
              onInput={(e) => setSeqSwing(parseInt(e.currentTarget.value))}
              style={{
                background: `linear-gradient(to right, rgba(100,225,225,0.5) ${seqSwing()}%, rgba(255,255,255,0.08) ${seqSwing()}%)`,
              }}
            />
          </div>
          <span class="text-[0.65rem] font-mono text-white/40 w-7 text-right">
            {seqSwing()}%
          </span>
        </div>

        {/* Randomize */}
        <button
          onClick={handleRandomize}
          title="Randomize samples"
          class="w-7 h-7 border border-white/[0.12] rounded-md bg-white/[0.04] text-white/50 cursor-pointer flex items-center justify-center shrink-0 transition-all duration-150 p-0"
        >
          <Dices size={14} />
        </button>

        {/* Presets */}
        <div data-seq-interactive class="shrink-0">
          <button
            ref={presetsBtnRef}
            onClick={() => setShowPresets(!showPresets())}
            title="Pattern presets"
            class={cn(
              "w-7 h-7 border border-white/[0.12] rounded-md cursor-pointer",
              "flex items-center justify-center shrink-0 transition-all duration-150 p-0",
              showPresets()
                ? "bg-accent/[0.12] text-accent"
                : "bg-white/[0.04] text-white/50",
            )}
          >
            <Library size={14} />
          </button>
        </div>

        {/* Save Preset */}
        <div data-seq-interactive class="shrink-0">
          <button
            ref={saveBtnRef}
            onClick={() => { setShowSaveInput(!showSaveInput()); setSaveName(""); }}
            title="Save preset"
            class={cn(
              "w-7 h-7 border border-white/[0.12] rounded-md cursor-pointer",
              "flex items-center justify-center shrink-0 transition-all duration-150 p-0",
              showSaveInput()
                ? "bg-accent/[0.12] text-accent"
                : "bg-white/[0.04] text-white/50",
            )}
          >
            <Save size={14} />
          </button>
        </div>
      </div>

      {/* Presets dropdown — fixed so it escapes overflow */}
      <Show when={showPresets()}>
        <div
          onClick={() => setShowPresets(false)}
          class="fixed inset-0 z-[99]"
        />
        <div
          class="thin-scrollbar fixed min-w-[180px] max-h-80 overflow-y-auto bg-[rgba(20,22,28,0.97)] border border-white/10 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-lg p-1 z-[100]"
          style={{
            left: `${popoverLeft(presetsBtnRef, 180)}px`,
            bottom: `${window.innerHeight - (presetsBtnRef?.getBoundingClientRect().top ?? 0) + 6}px`,
          }}
        >
          <div class="px-3 pt-1.5 pb-1 text-[0.58rem] font-semibold tracking-wider uppercase text-white/30">
            Patterns
          </div>
          <For each={FACTORY_PRESETS}>
            {(preset) => (
              <div
                onClick={() => handleLoadPreset(preset)}
                class={cn(
                  "px-3 py-1.5 text-[0.72rem] rounded cursor-pointer transition-colors duration-100 whitespace-nowrap hover:bg-white/[0.08]",
                  preset.name === "Clear" ? "text-white/35" : "text-white/75",
                )}
              >
                {preset.name}
              </div>
            )}
          </For>

          <Show when={presets().length > 0}>
            <div class="h-px bg-white/[0.06] mx-2 my-1" />
            <div class="px-3 pt-1.5 pb-1 text-[0.58rem] font-semibold tracking-wider uppercase text-white/30">
              My Presets
            </div>
            <For each={presets()}>
              {(preset) => (
                <div
                  onClick={() => handleLoadPreset(preset)}
                  class="px-3 py-1.5 text-[0.72rem] text-white/75 rounded cursor-pointer transition-colors duration-100 whitespace-nowrap hover:bg-white/[0.08]"
                >
                  {preset.name}
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>

      {/* Save preset popup — fixed so it escapes overflow */}
      <Show when={showSaveInput()}>
        <div
          onClick={() => setShowSaveInput(false)}
          class="fixed inset-0 z-[99]"
        />
        <div
          class="fixed min-w-[200px] bg-[rgba(20,22,28,0.97)] border border-white/10 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-lg px-3 py-2.5 z-[100] flex gap-1.5 items-center"
          style={{
            left: `${popoverLeft(saveBtnRef, 200)}px`,
            bottom: `${window.innerHeight - (saveBtnRef?.getBoundingClientRect().top ?? 0) + 6}px`,
          }}
        >
          <input
            type="text"
            placeholder="Preset name..."
            value={saveName()}
            onInput={(e) => setSaveName(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") savePreset(); }}
            autofocus
            class="flex-1 h-[26px] bg-white/5 border border-white/10 rounded text-white/80 text-[0.72rem] px-2 outline-none"
          />
          <button
            onClick={savePreset}
            class="h-[26px] px-2.5 bg-accent/15 border border-accent/30 rounded text-accent text-[0.65rem] font-semibold tracking-wide cursor-pointer whitespace-nowrap"
          >
            Save
          </button>
        </div>
      </Show>

      {/* Grid */}
      <DragDropProvider
        onDragEnd={handleDragEnd}
        collisionDetector={closestCenter}
      >
        <DragDropSensors />
        <div
          ref={gridScrollRef}
          class="thin-scrollbar flex flex-col pr-4 overflow-x-auto overflow-y-hidden"
        >
          <SortableProvider ids={sortableIds()}>
            <For each={tracks()}>
              {(track, rowIdx) => {
                const sortable = createSortable(track.id);
                return (
                  <>
                  <Show when={rowIdx() > 0}>
                    <div class="flex shrink-0 relative z-[3]" style={{ height: "3px" }}>
                      <div class="sticky left-0 z-[2] shrink-0 border-r border-white/[0.06]" style={{ width: "149px", background: "#0a0c10" }} />
                      <div class="flex-1" style={{ background: "#0a0c10" }} />
                    </div>
                  </Show>
                  <div
                    ref={sortable.ref}
                    class="flex items-center"
                    style={{
                      opacity: sortable.isActiveDraggable ? "0.25" : "1",
                      ...transformStyle(sortable.transform),
                      transition: sortable.isActiveDraggable ? undefined : "transform 200ms ease",
                      "z-index": sortable.isActiveDraggable ? "1" : scatterPopupTrack() === rowIdx() ? "50" : undefined,
                    }}
                  >
                    {/* Sticky track controls */}
                    <div class="sticky left-0 z-[2] flex items-center gap-1.5 pr-1.5 pl-4 shrink-0 border-r border-white/[0.06]" style={{ background: "#101218" }}>
                      {/* Volume fader */}
                      <div
                        data-seq-interactive
                        class="w-5 h-12 shrink-0 flex items-center justify-center relative"
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
                          class="w-10 h-1 appearance-none rounded-sm outline-none cursor-pointer -rotate-90"
                          style={{
                            background: `linear-gradient(to right, ${track.color} ${Math.round(seqTrackVolumes()[rowIdx()] * 100)}%, rgba(255,255,255,0.08) ${Math.round(seqTrackVolumes()[rowIdx()] * 100)}%)`,
                          }}
                          title={`Volume: ${Math.round(seqTrackVolumes()[rowIdx()] * 100)}%`}
                        />
                      </div>

                      {/* Track label */}
                      <div
                        data-seq-interactive
                        class="w-[100px] shrink-0 flex flex-col gap-0.5 py-0.5"
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
                          class={cn(
                            "text-[0.72rem] font-semibold tracking-wide overflow-hidden text-ellipsis whitespace-nowrap",
                            "cursor-pointer transition-colors duration-150 leading-tight",
                          )}
                          style={{
                            color: armedTrack() === rowIdx() ? "#ffffff" : track.color,
                            opacity: armedTrack() === rowIdx() ? "1" : "0.85",
                          }}
                          title={armedTrack() === rowIdx() ? "Click a sample on the map..." : track.name}
                        >
                          {track.name}
                        </div>

                        {/* Buttons row */}
                        <div class="flex gap-1 items-center">
                          {/* Grip handle */}
                          <div
                            data-seq-interactive
                            {...sortable.dragActivators}
                            class="text-white/25 cursor-grab flex items-center p-px rounded-sm transition-colors duration-150"
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
                            class={cn(
                              "cursor-pointer flex items-center p-px rounded-sm transition-colors duration-150",
                              seqLockedTracks()[rowIdx()]
                                ? "text-accent/80"
                                : "text-white/20",
                            )}
                            title={seqLockedTracks()[rowIdx()] ? "Unlock track (allow randomize)" : "Lock track (prevent randomize)"}
                          >
                            <Show when={seqLockedTracks()[rowIdx()]} fallback={<LockOpen size={10} />}>
                              <Lock size={10} />
                            </Show>
                          </div>

                          {/* Scatter toggle */}
                          <div
                            data-seq-interactive
                            class="relative"
                            style={{ "z-index": scatterPopupTrack() === rowIdx() ? "50" : undefined }}
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
                              class={cn(
                                "cursor-pointer flex items-center p-px rounded-sm transition-colors duration-150",
                                seqScatterEnabled()[rowIdx()]
                                  ? "text-teal-400/90"
                                  : "text-white/20",
                              )}
                              title={seqScatterEnabled()[rowIdx()] ? "Disable scatter" : "Enable scatter"}
                            >
                              <Show when={seqScatterEnabled()[rowIdx()]} fallback={<CircleDashed size={10} />}>
                                <CircleDotDashed size={10} />
                              </Show>
                            </div>

                            {/* Scatter radius popup */}
                            <Show when={scatterPopupTrack() === rowIdx() && seqScatterEnabled()[rowIdx()]}>
                              <div class="absolute top-full left-1/2 -translate-x-1/2 pt-2.5 px-3 pb-2">
                                <div class="relative z-[100] bg-panel border border-white/10 rounded-md shadow-[0_6px_24px_rgba(0,0,0,0.8)] px-2 py-1.5 flex items-center gap-1.5 whitespace-nowrap">
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
                                    class="w-14 h-[3px] appearance-none rounded-sm outline-none cursor-pointer"
                                    style={{
                                      background: `linear-gradient(to right, rgba(45,212,191,0.5) ${((seqScatterRadius()[rowIdx()] - 10) / 90) * 100}%, rgba(255,255,255,0.08) ${((seqScatterRadius()[rowIdx()] - 10) / 90) * 100}%)`,
                                    }}
                                  />
                                  <span class="text-[0.55rem] font-mono text-white/45 min-w-[18px] text-right">
                                    {seqScatterRadius()[rowIdx()]}
                                  </span>
                                </div>
                              </div>
                            </Show>
                          </div>

                          {/* Delete track */}
                          <div
                            data-seq-interactive
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTrack(rowIdx());
                            }}
                            class="text-white/20 cursor-pointer flex items-center p-px rounded-sm transition-colors duration-150"
                            title="Remove track"
                          >
                            <X size={10} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Steps */}
                    <div class="flex gap-[3px] flex-1 min-w-min overflow-y-hidden">
                      <For each={seqGrid()[rowIdx()]?.slice(0, seqBars() * STEPS_PER_BAR)}>
                        {(active, colIdx) => {
                          const isOddGroup = () => Math.floor(colIdx() / 4) % 2 === 1;
                          const isPlayhead = () => seqStep() === colIdx();
                          return (
                            <div
                              onClick={() => toggle(rowIdx(), colIdx())}
                              class="relative flex-1 min-w-[30px] h-12 rounded cursor-pointer overflow-hidden transition-[background,box-shadow] duration-100"
                              style={{
                                background: active
                                  ? track.color
                                  : isOddGroup()
                                    ? "rgba(255,255,255,0.02)"
                                    : "rgba(255,255,255,0.07)",
                                "box-shadow": isPlayhead()
                                  ? active
                                    ? `0 0 12px ${track.color}88, inset 0 1px 0 rgba(255,255,255,0.15), inset 0 0 0 1.5px rgba(255,255,255,0.5)`
                                    : "inset 0 0 0 1.5px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.03)"
                                  : active
                                    ? `0 0 8px ${track.color}44, inset 0 1px 0 rgba(255,255,255,0.15)`
                                    : "inset 0 1px 0 rgba(255,255,255,0.03)",
                              }}
                            >
                              {/* Top notch */}
                              <div
                                class="absolute top-[3px] left-1/2 -translate-x-1/2 w-[40%] h-1 rounded-sm"
                                style={{
                                  background: active
                                    ? "rgba(0,0,0,0.25)"
                                    : "rgba(255,255,255,0.04)",
                                }}
                              />
                              {/* Playhead overlay */}
                              <Show when={isPlayhead()}>
                                <div
                                  class="absolute inset-0 rounded pointer-events-none"
                                  style={{
                                    background: active
                                      ? "rgba(255,255,255,0.12)"
                                      : "rgba(255,255,255,0.06)",
                                  }}
                                />
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                  </>
                );
              }}
            </For>
          </SortableProvider>

          {/* Add track button */}
          <div
            data-seq-interactive
            onClick={handleAddTrack}
            class="sticky left-0 flex items-center justify-center w-[148px] h-7 mt-0.5 pl-4 rounded border border-dashed border-white/[0.08] text-white/25 cursor-pointer transition-all duration-150"
          >
            <Plus size={14} />
          </div>
        </div>
      </DragDropProvider>

      {/* Delete track confirmation modal */}
      <Show when={confirmDeleteTrack() >= 0}>
        <div
          onClick={() => setConfirmDeleteTrack(-1)}
          class="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            class="bg-[rgba(20,22,28,0.98)] border border-white/10 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.8)] backdrop-blur-lg px-6 py-5 max-w-[320px]"
          >
            <div class="text-[0.85rem] font-semibold text-white/90 mb-2">
              Delete track?
            </div>
            <div class="text-[0.72rem] text-white/50 mb-4 leading-snug">
              This track has notes. Are you sure you want to remove it?
            </div>
            <div class="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteTrack(-1)}
                class="h-7 px-3 bg-white/[0.06] border border-white/10 rounded-md text-white/60 text-[0.68rem] font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => doDeleteTrack(confirmDeleteTrack())}
                class="h-7 px-3 bg-red-500/15 border border-red-500/30 rounded-md text-red-500 text-[0.68rem] font-semibold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
