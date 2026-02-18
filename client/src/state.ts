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
