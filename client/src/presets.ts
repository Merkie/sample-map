import type { SavedPreset } from "./state";

const STEPS = 16;

// prettier-ignore
export const FACTORY_PRESETS: SavedPreset[] = [
  // --- Hip Hop / Boom Bap / Trap ---
  {
    id: "factory-0", name: "Hip Hop", bpm: 90, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,true] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,false,true, true,false,true,false, true,false,false,true] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,true, false,false,false,false, false,false,false,true, false,false,false,false] },
    ],
  },
  {
    id: "factory-1", name: "Boom Bap", bpm: 90, swing: 45,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,true, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,true, true,false,true,true, true,false,true,true, true,false,true,true] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,true,false,false, false,false,false,false, false,true,false,false] },
    ],
  },
  {
    id: "factory-2", name: "Trap", bpm: 140, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, true,false,false,true, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,true,false,true, true,true,false,true, true,true,false,true, true,true,true,true] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,true,false, false,false,false,false, true,false,true,false] },
    ],
  },
  // --- Afrobeat ---
  {
    id: "factory-3", name: "Afrobeat Starter", bpm: 100, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,true,false, false,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,true, false,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,false,false, true,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,true, false,false,false,false, false,false,false,false, false,false,false,false] },
    ],
  },
  {
    id: "factory-4", name: "Afrobeat 1", bpm: 95, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,false,true, false,false,true,false, false,false,true,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
    ],
  },
  {
    id: "factory-5", name: "Afrobeat 2", bpm: 95, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,false,false, false,false,true,true, false,false,false,false, false,false,true,true], volume: 0.83 },
    ],
  },
  {
    id: "factory-6", name: "Afrobeat 3", bpm: 115, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [true,false,false,true, false,false,true,false, true,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,true,false, false,false,true,false, false,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,false,true, false,false,false,false, true,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false] },
    ],
  },
  {
    id: "factory-7", name: "Afrobeat 4", bpm: 105, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, false,false,true,false, false,false,true,false, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,true,false, false,false,false,false, false,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,false,true, false,false,true,false, false,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,false,false, false,false,true,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,false,false, false,false,false,false, true,false,false,false] },
    ],
  },
  {
    id: "factory-8", name: "Afrobeat 5", bpm: 113, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,true, false,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,true,false, false,false,false,false, false,false,false,false, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,false,false, false,true,false,false, false,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, true,false,false,false, false,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,false,true, false,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,true,false, false,false,true,false, false,false,true,false, false,false,true,false] },
    ],
  },
  // --- Dembow / Reggaeton / Perreo ---
  {
    id: "factory-9", name: "Dembow Starter", bpm: 98, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, true,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,true,false,false, false,true,false,false, false,true,false,false, false,true,false,false] },
    ],
  },
  {
    id: "factory-10", name: "Reggaeton Starter", bpm: 100, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick", pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "perc", pattern: [false,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false] },
    ],
  },
  {
    id: "factory-11", name: "Reggaeton 1", bpm: 100, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, true,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,true,false, false,false,true,false, false,false,true,false, false,false,true,false], volume: 0.6 },
      { samplePath: "", sampleCategory: "perc",  pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false], volume: 0.77 },
    ],
  },
  {
    id: "factory-12", name: "Reggaeton 2", bpm: 100, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [false,false,true,false, false,false,true,false, false,false,true,false, false,false,true,false], volume: 0.6 },
    ],
  },
  {
    id: "factory-13", name: "Reggaeton 3", bpm: 92, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, true,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "kick",  pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,true,true,true, false,false,false,false, false,true,true,true, false,false,false,false], volume: 0.55 },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,true, false,false,true,false, false,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, false,false,false,false, false,false,false,false, false,true,true,true] },
    ],
  },
  {
    id: "factory-14", name: "Perreo", bpm: 100, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,true, false,false,false,false, true,false,false,true, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,true, false,false,false,false, true,false,false,true] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,true,true,false, true,true,true,false, true,true,true,false, true,true,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,true,false, false,false,false,false, false,false,true,false] },
    ],
  },
  // --- Utility ---
  {
    id: "factory-15", name: "Clear", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: Array(STEPS).fill(false) },
      { samplePath: "", sampleCategory: "snare", pattern: Array(STEPS).fill(false) },
      { samplePath: "", sampleCategory: "hihat", pattern: Array(STEPS).fill(false) },
      { samplePath: "", sampleCategory: "perc",  pattern: Array(STEPS).fill(false) },
    ],
  },
];
