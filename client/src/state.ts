import { createSignal } from "solid-js";
import type { SampleNode } from "./engine";
import type { SampleMapEngine } from "./engine";

export const STEPS = 16;

// -- Engine singleton --
export const [engine, setEngine] = createSignal<SampleMapEngine | null>(null);

// -- App-level UI state --
export const [loading, setLoading] = createSignal(true);
export const [error, setError] = createSignal<string | null>(null);
export const [sampleCount, setSampleCount] = createSignal(0);

// -- Sequencer toggle --
export const [seqActive, setSeqActive] = createSignal(false);

// -- Sequencer samples & armed track --
export const [seqSamples, setSeqSamples] = createSignal<SampleNode[]>([]);
export const [armedTrack, setArmedTrack] = createSignal(-1);

// -- Sequencer transport --
export const [seqPlaying, setSeqPlaying] = createSignal(false);
export const [seqBpm, setSeqBpm] = createSignal(120);
export const [seqSwing, setSeqSwing] = createSignal(0);

// -- Sequencer grid & per-track state --
export const [seqGrid, setSeqGrid] = createSignal<boolean[][]>(
  Array.from({ length: 4 }, () => Array(STEPS).fill(false) as boolean[]),
);
export const [seqStep, setSeqStep] = createSignal(-1);
export const [seqLockedTracks, setSeqLockedTracks] = createSignal<boolean[]>(
  Array.from({ length: 4 }, () => false),
);
export const [seqTrackVolumes, setSeqTrackVolumes] = createSignal<number[]>(
  Array.from({ length: 4 }, () => 1.0),
);
export const [seqScatterEnabled, setSeqScatterEnabled] = createSignal<boolean[]>(
  Array.from({ length: 4 }, () => false),
);
export const [seqScatterRadius, setSeqScatterRadius] = createSignal<number[]>(
  Array.from({ length: 4 }, () => 30),
);

// -- Debug panel --
export const [debugActive, setDebugActive] = createSignal(false);
export const [showZoneBorders, setShowZoneBorders] = createSignal(false);
export const [physicsEnabled, setPhysicsEnabled] = createSignal(true);

// -- Presets --
export interface SavedPreset {
  id: string;
  name: string;
  bpm: number;
  swing: number;
  tracks: {
    samplePath: string;       // relativePath ("" for factory)
    sampleCategory: string;   // zone: kick/snare/hihat/perc
    pattern: boolean[];       // 16 steps
    volume?: number;          // 0–1, defaults to 1.0
    scatter?: boolean;        // scatter mode enabled (defaults false)
    scatterRadius?: number;   // scatter radius in world units (defaults 30)
  }[];
}

export const [presets, setPresets] = createSignal<SavedPreset[]>([]);
export const [showAdaptModal, setShowAdaptModal] = createSignal<{ preset: SavedPreset; missingCount: number } | null>(null);

// Callback signal for applyPreset — set by Sequencer, called by adaptation modal
export const [applyPresetFn, setApplyPresetFn] = createSignal<((preset: SavedPreset, adapt: boolean) => void) | null>(null);

// -- Coordinated update functions --
// These replace signal-to-signal sync effects by atomically updating all parallel arrays

/** Reset all sequencer tracks to a new sample set, clearing grid and per-track state */
export function resetSeqTracks(samples: SampleNode[]) {
  setSeqSamples(samples);
  setSeqGrid(Array.from({ length: samples.length }, () => Array(STEPS).fill(false) as boolean[]));
  setSeqLockedTracks(Array.from({ length: samples.length }, () => false));
  setSeqTrackVolumes(Array.from({ length: samples.length }, () => 1.0));
  setSeqScatterEnabled(Array.from({ length: samples.length }, () => false));
  setSeqScatterRadius(Array.from({ length: samples.length }, () => 30));
}

/** Add a single track to the sequencer with default per-track values */
export function addSeqTrack(sample: SampleNode) {
  setSeqSamples((prev) => [...prev, sample]);
  setSeqGrid((prev) => [...prev, Array(STEPS).fill(false) as boolean[]]);
  setSeqLockedTracks((prev) => [...prev, false]);
  setSeqTrackVolumes((prev) => [...prev, 1.0]);
  setSeqScatterEnabled((prev) => [...prev, false]);
  setSeqScatterRadius((prev) => [...prev, 30]);
}
