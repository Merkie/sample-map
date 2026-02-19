import { createSignal } from "solid-js";
import type { SampleNode } from "./engine";
import type { SampleMapEngine } from "./engine";

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
  }[];
}

export const [presets, setPresets] = createSignal<SavedPreset[]>([]);
export const [showAdaptModal, setShowAdaptModal] = createSignal<{ preset: SavedPreset; missingCount: number } | null>(null);

// Callback signal for applyPreset — set by Sequencer, called by adaptation modal
export const [applyPresetFn, setApplyPresetFn] = createSignal<((preset: SavedPreset, adapt: boolean) => void) | null>(null);
