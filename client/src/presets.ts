import type { SavedPreset } from "./state";

const STEPS = 16;

// prettier-ignore
export const FACTORY_PRESETS: SavedPreset[] = [
  {
    id: "factory-0", name: "Four on the Floor", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,true,false, false,false,false,false, false,false,true,false] },
    ],
  },
  {
    id: "factory-1", name: "Basic Rock", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, true,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,false,true, false,false,false,false, false,false,false,true] },
    ],
  },
  {
    id: "factory-2", name: "Hip Hop", bpm: 90, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,true] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,false,true, true,false,true,false, true,false,false,true] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,true, false,false,false,false, false,false,false,true, false,false,false,false] },
    ],
  },
  {
    id: "factory-3", name: "Boom Bap", bpm: 90, swing: 45,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,true, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,true, true,false,true,true, true,false,true,true, true,false,true,true] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,true,false,false, false,false,false,false, false,true,false,false] },
    ],
  },
  {
    id: "factory-4", name: "Trap", bpm: 140, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, true,false,false,true, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,true,false,true, true,true,false,true, true,true,false,true, true,true,true,true] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,true,false, false,false,false,false, true,false,true,false] },
    ],
  },
  {
    id: "factory-5", name: "Dembow Classic", bpm: 98, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,false, false,false,false,false, true,false,false,false, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,true, false,false,false,true, false,false,false,true, false,false,false,true] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,true,false,false, false,true,false,false, false,true,false,false, false,true,false,false] },
    ],
  },
  {
    id: "factory-6", name: "Dembow Full", bpm: 98, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,true, false,false,true,false, true,false,false,true, false,false,true,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,false,true, false,false,false,false, false,false,false,true] },
    ],
  },
  {
    id: "factory-7", name: "Perreo", bpm: 100, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: [true,false,false,true, false,false,false,false, true,false,false,true, false,false,false,false] },
      { samplePath: "", sampleCategory: "snare", pattern: [false,false,false,false, true,false,false,true, false,false,false,false, true,false,false,true] },
      { samplePath: "", sampleCategory: "hihat", pattern: [true,true,true,false, true,true,true,false, true,true,true,false, true,true,true,false] },
      { samplePath: "", sampleCategory: "perc",  pattern: [false,false,false,false, false,false,true,false, false,false,false,false, false,false,true,false] },
    ],
  },
  {
    id: "factory-8", name: "Clear", bpm: 120, swing: 0,
    tracks: [
      { samplePath: "", sampleCategory: "kick",  pattern: Array(STEPS).fill(false) },
      { samplePath: "", sampleCategory: "snare", pattern: Array(STEPS).fill(false) },
      { samplePath: "", sampleCategory: "hihat", pattern: Array(STEPS).fill(false) },
      { samplePath: "", sampleCategory: "perc",  pattern: Array(STEPS).fill(false) },
    ],
  },
];
