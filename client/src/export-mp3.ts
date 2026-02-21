import {
  STEPS_PER_BAR,
  engine,
  seqGrid,
  seqSamples,
  seqTrackVolumes,
  seqBpm,
  seqSwing,
  seqBars,
  seqScatterEnabled,
  seqScatterRadius,
  exporting,
  setExporting,
} from "./state";

const SAMPLE_RATE = 44100;
const MP3_KBPS = 192;
const MAX_TAIL_S = 2; // extra seconds for sample tails after last step

/** Load lamejs on demand via script tag (self-contained bundle, no CJS issues) */
function loadLamejs(): Promise<LamejsGlobal> {
  if (window.lamejs) return Promise.resolve(window.lamejs);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/lame.min.js";
    script.onload = () => {
      if (window.lamejs) resolve(window.lamejs);
      else reject(new Error("lamejs failed to initialize"));
    };
    script.onerror = () => reject(new Error("Failed to load lame.min.js"));
    document.head.appendChild(script);
  });
}

export async function exportToMp3() {
  if (exporting()) return;

  const eng = engine();
  if (!eng) throw new Error("Engine not ready");

  const grid = seqGrid();
  const samples = seqSamples();
  const volumes = seqTrackVolumes();
  const bpm = seqBpm();
  const swing = seqSwing();
  const bars = seqBars();
  const totalSteps = bars * STEPS_PER_BAR;

  // Check if there are any active notes
  let hasNotes = false;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < totalSteps; col++) {
      if (grid[row][col]) { hasNotes = true; break; }
    }
    if (hasNotes) break;
  }
  if (!hasNotes) {
    alert("No notes to export — toggle some steps first.");
    return;
  }

  setExporting(true);
  try {
    // Load lamejs encoder on demand
    const lamejs = await loadLamejs();

    // Pre-fetch any uncached AudioBuffers
    const ctx = eng.getAudioContext();
    for (let row = 0; row < samples.length; row++) {
      const node = samples[row];
      if (!node) continue;
      let buf = eng.getAudioBuffer(node.id);
      if (!buf) {
        const url = `/api/audio/${encodeURIComponent(node.relativePath)}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const arrayBuf = await res.arrayBuffer();
        buf = await ctx.decodeAudioData(arrayBuf);
        eng.setAudioBuffer(node.id, buf);
      }
    }

    // Calculate step times (same swing math as Sequencer.tsx tick loop)
    const stepMs = 60000 / bpm / 4;
    const swingOffset = stepMs * (swing / 100) * 0.33;
    const stepTimes: number[] = [];
    for (let i = 0; i < totalSteps; i++) {
      if (i === 0) {
        stepTimes.push(0);
      } else {
        const prevIsOdd = (i - 1) % 2 === 1;
        const delay = prevIsOdd ? stepMs - swingOffset : stepMs + swingOffset;
        stepTimes.push(stepTimes[i - 1] + delay);
      }
    }

    // Find max sample duration for tail
    let maxTail = 0;
    for (const node of samples) {
      if (!node) continue;
      const buf = eng.getAudioBuffer(node.id);
      if (buf) maxTail = Math.max(maxTail, buf.duration);
    }
    maxTail = Math.min(maxTail, MAX_TAIL_S);

    const loopEndS = (stepTimes[totalSteps - 1] ?? 0) / 1000 + stepMs / 1000;
    const renderLengthS = loopEndS + maxTail;
    const renderLengthFrames = Math.ceil(renderLengthS * SAMPLE_RATE);

    // Create offline context and schedule all notes
    const offline = new OfflineAudioContext(2, renderLengthFrames, SAMPLE_RATE);
    const scatter = seqScatterEnabled();
    const radii = seqScatterRadius();

    for (let row = 0; row < grid.length; row++) {
      const node = samples[row];
      if (!node) continue;
      const vol = volumes[row] ?? 1.0;
      const isScatter = scatter[row] ?? false;
      const radius = radii[row] ?? 30;

      for (let col = 0; col < totalSteps; col++) {
        if (!grid[row][col]) continue;

        // Pick target: scatter picks a random neighbor, otherwise base sample
        let target = node;
        if (isScatter) {
          const nearby = eng.getNodesInRadius(node, radius);
          if (nearby.length > 0) {
            target = nearby[Math.floor(Math.random() * nearby.length)];
          }
        }

        // Ensure buffer is cached for scatter targets
        let buf = eng.getAudioBuffer(target.id);
        if (!buf) {
          const url = `/api/audio/${encodeURIComponent(target.relativePath)}`;
          const res = await fetch(url);
          if (!res.ok) continue;
          const arrayBuf = await res.arrayBuffer();
          buf = await ctx.decodeAudioData(arrayBuf);
          eng.setAudioBuffer(target.id, buf);
        }

        const timeS = stepTimes[col] / 1000;
        const source = offline.createBufferSource();
        source.buffer = buf;
        const gain = offline.createGain();
        gain.gain.setValueAtTime(0, timeS);
        gain.gain.linearRampToValueAtTime(0.6 * vol, timeS + 0.02);
        source.connect(gain);
        gain.connect(offline.destination);
        source.start(timeS);
      }
    }

    // Render
    const rendered = await offline.startRendering();

    // Convert Float32 → Int16 PCM → MP3
    const left = rendered.getChannelData(0);
    const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
    const numSamples = left.length;
    const blockSize = 1152;
    const encoder = new lamejs.Mp3Encoder(2, SAMPLE_RATE, MP3_KBPS);
    const mp3Chunks: Int8Array[] = [];

    for (let i = 0; i < numSamples; i += blockSize) {
      const end = Math.min(i + blockSize, numSamples);
      const leftChunk = new Int16Array(end - i);
      const rightChunk = new Int16Array(end - i);
      for (let j = i; j < end; j++) {
        const s = j - i;
        leftChunk[s] = Math.max(-32768, Math.min(32767, Math.round(left[j] * 32767)));
        rightChunk[s] = Math.max(-32768, Math.min(32767, Math.round(right[j] * 32767)));
      }
      const chunk = encoder.encodeBuffer(leftChunk, rightChunk);
      if (chunk.length > 0) mp3Chunks.push(chunk);
    }

    const tail = encoder.flush();
    if (tail.length > 0) mp3Chunks.push(tail);

    // Build blob and trigger download
    const blob = new Blob(mp3Chunks, { type: "audio/mp3" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sample-map-${bpm}bpm.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}
