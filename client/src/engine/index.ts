export type { SampleNode } from "./types";
export type { Camera } from "./camera";

import type { SampleNode } from "./types";
import type { Camera } from "./camera";
import { updateFreeCamera } from "./camera";
import { createSimulation, preSettle, tickSimulation, syncFromSimulation, stopSimulation } from "./physics";
import { renderStars, renderSamples, renderSelectionRing, renderHUD } from "./renderer";
import { createSelectionRing, selectNode, dismissRing, updateSelectionRing } from "./selection-ring";
import {
  TSNE_SCALE,
  ZOOM_MIN, ZOOM_MAX, ZOOM_FRICTION, ZOOM_SNAP_BACK_STIFFNESS, ZOOM_WHEEL_SENSITIVITY,
  SAMPLE_RADIUS, SAMPLE_GLOW_DECAY,
  RING_NAV_MAX_DIST, RING_NAV_CONE_HALF,
  CAM_FOLLOW_LERP,
  physicsConfig,
} from "./constants";
import { clamp, hslToHex, lerp } from "./utils";

export class SampleMapEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;

  nodes: SampleNode[] = [];

  camera: Camera = { x: 0, y: 0, zoom: 1.5 };

  private panVelocityX = 0;
  private panVelocityY = 0;
  private dragging = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private zoomVelocity = 0;
  private zoomFocalScreenX = 0;
  private zoomFocalScreenY = 0;

  time = 0;
  playing = false;
  animFrameId = 0;
  lastTimestamp = 0;

  hoveredNode: SampleNode | null = null;
  private mouseScreenX = 0;
  private mouseScreenY = 0;
  private mouseInWindow = false;

  // Audio playback
  private audioCtx: AudioContext | null = null;
  private audioCache = new Map<string, AudioBuffer>();
  private audioPlaying = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private lastPlayedId: string | null = null;

  // Selection ring
  selectionRing = createSelectionRing();

  // Camera follow (ring selection tracking)
  private followTarget: { x: number; y: number } | null = null;

  // Animated zoom-to-fit target
  private zoomToFitTarget: { x: number; y: number; zoom: number } | null = null;

  // Click detection
  private clickStartX = 0;
  private clickStartY = 0;
  private dragDistance = 0;

  // Stars cache
  private stars: Array<{ x: number; y: number; b: number; s: number; d: number }> = [];

  // Sequencer dimming: when set, only these nodes render at full brightness
  highlightedNodeIds: Set<string> | null = null;

  // Top margin in screen pixels (e.g. for header overlay)
  topMargin = 0;

  // Callbacks
  onSampleCount?: (n: number) => void;
  onNodeSelect?: (node: SampleNode | null) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.generateStars();
    this.resize();
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
  }

  private generateStars() {
    // Seeded PRNG (mulberry32) for deterministic star field
    let seed = 42;
    const rng = () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    this.stars = [];
    for (let i = 0; i < 200; i++) {
      this.stars.push({
        x: rng(), y: rng(),
        b: 0.08 + rng() * 0.18, s: 0.3 + rng() * 0.5, d: 0,
      });
    }
    for (let i = 0; i < 120; i++) {
      this.stars.push({
        x: rng(), y: rng(),
        b: 0.15 + rng() * 0.3, s: 0.6 + rng() * 0.8, d: 1,
      });
    }
    for (let i = 0; i < 60; i++) {
      this.stars.push({
        x: rng(), y: rng(),
        b: 0.3 + rng() * 0.35, s: 1.0 + rng() * 1.2, d: 2,
      });
    }
    // Foreground layer — moves nearly 1:1 with nodes
    for (let i = 0; i < 30; i++) {
      this.stars.push({
        x: rng(), y: rng(),
        b: 0.4 + rng() * 0.3, s: 1.4 + rng() * 1.0, d: 3,
      });
    }
  }

  // ===== Data Loading =====

  loadSamples(rawSamples: Array<{ name: string; relativePath: string; category: string; x: number; y: number }>) {
    // Find t-SNE range for normalization
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of rawSamples) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y);
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const scale = TSNE_SCALE / Math.max(rangeX, rangeY) * 2;

    this.nodes = rawSamples.map((s, i) => {
      const tsneX = (s.x - midX) * scale;
      const tsneY = (s.y - midY) * scale;
      // Color from t-SNE position: angle → hue, distance → saturation
      const angle = Math.atan2(tsneY, tsneX);
      const hue = ((angle / Math.PI + 1) / 2) * 360; // 0-360
      const maxDist = TSNE_SCALE;
      const dist = Math.sqrt(tsneX * tsneX + tsneY * tsneY);
      const sat = 55 + 30 * Math.min(dist / maxDist, 1); // 55-85%
      const lit = 58 + 12 * Math.min(dist / maxDist, 1);  // 58-70%
      const color = hslToHex(hue, sat, lit);
      return {
        id: `sample-${i}`,
        name: s.name,
        relativePath: s.relativePath,
        category: s.category,
        color,
        tsneX,
        tsneY,
        x: tsneX,
        y: tsneY,
        vx: 0,
        vy: 0,
        glow: 0,
        hovered: false,
      };
    });

    // Create and pre-settle the force simulation
    createSimulation(this.nodes);
    preSettle(physicsConfig.preSettleTicks);
    syncFromSimulation(this.nodes);

    this.onSampleCount?.(this.nodes.length);
  }

  // ===== Lifecycle =====

  start() {
    this.playing = true;
    this.lastTimestamp = performance.now();
    this.animFrameId = requestAnimationFrame(this.tick);
  }

  stop() {
    this.playing = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  reset() {
    this.stop();
    this.stopAllAudio();
    stopSimulation();
    this.time = 0;
    this.nodes = [];
    this.hoveredNode = null;
    this.lastPlayedId = null;
    this.selectionRing = createSelectionRing();
    this.camera = { x: 0, y: 0, zoom: 1.5 };
    this.panVelocityX = 0;
    this.panVelocityY = 0;
    this.zoomVelocity = 0;
    this.dragging = false;
    this.followTarget = null;
  }

  private stopAllAudio() {
    for (const [, playing] of this.audioPlaying) {
      try { playing.source.stop(); } catch {}
    }
    this.audioPlaying.clear();
  }

  // ===== Input =====

  screenToWorld(sx: number, sy: number): [number, number] {
    return [
      (sx - this.width / 2) / this.camera.zoom + this.camera.x,
      (sy - this.height / 2) / this.camera.zoom + this.camera.y,
    ];
  }

  onPointerDown(x: number, y: number) {
    this.dragging = true;
    this.dragLastX = x;
    this.dragLastY = y;
    this.clickStartX = x;
    this.clickStartY = y;
    this.dragDistance = 0;
    this.panVelocityX = 0;
    this.panVelocityY = 0;
    this.followTarget = null;
    this.zoomToFitTarget = null;
  }

  onPointerMove(x: number, y: number) {
    this.mouseScreenX = x;
    this.mouseScreenY = y;
    this.mouseInWindow = true;

    if (this.dragging) {
      const dx = x - this.dragLastX;
      const dy = y - this.dragLastY;
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this.panVelocityX = -dx / this.camera.zoom;
      this.panVelocityY = -dy / this.camera.zoom;
      this.dragLastX = x;
      this.dragLastY = y;
      const tdx = x - this.clickStartX;
      const tdy = y - this.clickStartY;
      this.dragDistance = Math.sqrt(tdx * tdx + tdy * tdy);

      // Dismiss ring once the user is actually panning (not just clicking)
      if (this.dragDistance >= 5 && this.selectionRing.active) {
        dismissRing(this.selectionRing);
        this.followTarget = null;
      }
    }
  }

  onPointerUp(x?: number, y?: number) {
    this.dragging = false;
    if (x != null && y != null && this.dragDistance < 5) {
      this.handleClick(x, y);
    }
  }

  onPointerLeave() {
    this.mouseInWindow = false;
    this.dragging = false;
  }

  private handleClick(screenX: number, screenY: number) {
    const [wx, wy] = this.screenToWorld(screenX, screenY);
    const hitRadius = SAMPLE_RADIUS / this.camera.zoom + 8;
    let closest: SampleNode | null = null;
    let closestDist = Infinity;

    for (const node of this.nodes) {
      const dx = node.x - wx;
      const dy = node.y - wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hitRadius && dist < closestDist) {
        closest = node;
        closestDist = dist;
      }
    }

    if (closest) {
      selectNode(this.selectionRing, closest);
      this.playRingSelection(closest);
      this.followTarget = { x: closest.x, y: closest.y };
      this.onNodeSelect?.(closest);
    } else {
      if (this.selectionRing.active) {
        dismissRing(this.selectionRing);
        this.followTarget = null;
      }
      this.onNodeSelect?.(null);
    }
  }

  onEscape() {
    if (this.selectionRing.active) {
      dismissRing(this.selectionRing);
      this.followTarget = null;
    }
  }

  onArrowKey(direction: "up" | "down" | "left" | "right") {
    if (!this.selectionRing.active || !this.selectionRing.node) return;

    const current = this.selectionRing.node;
    const dirAngle =
      direction === "right" ? 0 :
      direction === "down" ? Math.PI / 2 :
      direction === "left" ? Math.PI :
      -Math.PI / 2; // up

    let best: SampleNode | null = null;
    let bestScore = Infinity;

    for (const node of this.nodes) {
      if (node === current) continue;

      const dx = node.x - current.x;
      const dy = node.y - current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > RING_NAV_MAX_DIST || dist < 0.01) continue;

      // Angle from current to candidate
      let angle = Math.atan2(dy, dx);
      // Angle difference (wrapped to -π..π)
      let diff = angle - dirAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      if (Math.abs(diff) > RING_NAV_CONE_HALF) continue;

      // Score: prefer close + generally aligned (lower is better)
      // Low angular weight so closer off-axis nodes beat far aligned ones
      const score = dist * (1 + Math.abs(diff) * 0.6);
      if (score < bestScore) {
        bestScore = score;
        best = node;
      }
    }

    if (best) {
      selectNode(this.selectionRing, best);
      this.playRingSelection(best);
      this.followTarget = { x: best.x, y: best.y };
      this.onNodeSelect?.(best);
    }
  }

  onWheel(deltaY: number, x: number, y: number) {
    this.zoomFocalScreenX = x;
    this.zoomFocalScreenY = y;
    this.zoomVelocity += deltaY * ZOOM_WHEEL_SENSITIVITY * this.camera.zoom;
    this.zoomToFitTarget = null;
  }

  // ===== Main Loop =====

  tick = (timestamp: number) => {
    if (!this.playing) return;

    let dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    dt = Math.min(dt, 0.05);

    this.time += dt;

    // Run a few physics ticks per frame for settling
    tickSimulation();
    syncFromSimulation(this.nodes);

    // Update glow decay
    for (const node of this.nodes) {
      if (node.glow > 0) {
        node.glow = Math.max(0, node.glow - SAMPLE_GLOW_DECAY * dt);
      }
    }

    // Hit-test hover
    this.updateHover();

    // Selection ring spring physics
    updateSelectionRing(this.selectionRing, dt);

    this.updateCamera();
    this.render();

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private updateHover() {
    // Clear hover when cursor is outside the window
    if (!this.mouseInWindow) {
      for (const node of this.nodes) node.hovered = false;
      this.hoveredNode = null;
      this.lastPlayedId = null;
      return;
    }

    const [wx, wy] = this.screenToWorld(this.mouseScreenX, this.mouseScreenY);
    const hitRadius = SAMPLE_RADIUS / this.camera.zoom + 8;
    let closest: SampleNode | null = null;
    let closestDist = Infinity;

    for (const node of this.nodes) {
      node.hovered = false;
      const dx = node.x - wx;
      const dy = node.y - wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hitRadius && dist < closestDist) {
        closest = node;
        closestDist = dist;
      }
    }

    if (closest) {
      closest.hovered = true;

      // Only play hover audio when ring is not active
      if (!this.selectionRing.active) {
        closest.glow = 1;
        if (closest.id !== this.lastPlayedId) {
          this.lastPlayedId = closest.id;
          this.playSample(closest);
        }
      }
    } else if (!this.selectionRing.active) {
      this.lastPlayedId = null;
    }
    this.hoveredNode = closest;
  }

  /** Programmatically select + focus a node (ring, camera follow, play sound) */
  focusNode(node: SampleNode) {
    selectNode(this.selectionRing, node);
    this.playRingSelection(node);
    this.followTarget = { x: node.x, y: node.y };
  }

  // ===== Audio =====

  private playRingSelection(node: SampleNode) {
    node.glow = 1;
    this.lastPlayedId = node.id;
    this.playSample(node, true);
  }

  private ensureAudioCtx() {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  async playSample(node: SampleNode, force = false) {
    const ctx = this.ensureAudioCtx();
    const url = `/api/audio/${encodeURIComponent(node.relativePath)}`;

    let buffer = this.audioCache.get(node.id);
    if (!buffer) {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const arrayBuf = await res.arrayBuffer();
        buffer = await ctx.decodeAudioData(arrayBuf);
        this.audioCache.set(node.id, buffer);
      } catch {
        return;
      }
    }

    // Don't play if hover already moved on while fetching (skip check for forced plays)
    if (!force && this.lastPlayedId !== node.id) return;

    // Cap simultaneous voices — fade oldest if too many
    const MAX_VOICES = 8;
    if (this.audioPlaying.size >= MAX_VOICES) {
      const oldest = this.audioPlaying.entries().next().value;
      if (oldest) {
        const [oldId, oldPlaying] = oldest;
        oldPlaying.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
        const src = oldPlaying.source;
        setTimeout(() => { try { src.stop(); } catch {} }, 60);
        this.audioPlaying.delete(oldId);
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.02);

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    // Use a unique key so the same sample can overlap
    const playId = `${node.id}-${Date.now()}`;
    source.onended = () => {
      this.audioPlaying.delete(playId);
    };

    this.audioPlaying.set(playId, { source, gain });
  }

  // ===== Camera =====

  /** Compute world-space bounding box of all nodes with padding */
  private getNodeBounds(): { cx: number; cy: number; hw: number; hh: number } {
    if (this.nodes.length === 0) return { cx: 0, cy: 0, hw: 200, hh: 200 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    const pad = 80;
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      hw: (maxX - minX) / 2 + pad,
      hh: (maxY - minY) / 2 + pad,
    };
  }

  private updateCamera() {
    const [vx, vy] = updateFreeCamera(this.camera, this.panVelocityX, this.panVelocityY, this.dragging);
    this.panVelocityX = vx;
    this.panVelocityY = vy;

    // Follow selection ring target
    if (this.followTarget && !this.dragging) {
      this.camera.x = lerp(this.camera.x, this.followTarget.x, CAM_FOLLOW_LERP);
      this.camera.y = lerp(this.camera.y, this.followTarget.y, CAM_FOLLOW_LERP);
      // Kill pan momentum while following
      this.panVelocityX = 0;
      this.panVelocityY = 0;
    }

    // Animated zoom-to-fit
    if (this.zoomToFitTarget && !this.dragging) {
      const t = this.zoomToFitTarget;
      const lerpSpeed = 0.08;
      this.camera.x = lerp(this.camera.x, t.x, lerpSpeed);
      this.camera.y = lerp(this.camera.y, t.y, lerpSpeed);
      this.camera.zoom = lerp(this.camera.zoom, t.zoom, lerpSpeed);
      this.panVelocityX = 0;
      this.panVelocityY = 0;
      this.zoomVelocity = 0;
      // Settle once close enough
      if (
        Math.abs(this.camera.zoom - t.zoom) < 0.002 &&
        Math.abs(this.camera.x - t.x) < 0.5 &&
        Math.abs(this.camera.y - t.y) < 0.5
      ) {
        this.camera.zoom = t.zoom;
        this.camera.x = t.x;
        this.camera.y = t.y;
        this.zoomToFitTarget = null;
      }
    }

    // Dynamic zoom min: just enough to fit all nodes on screen
    const bounds = this.getNodeBounds();
    const fitZoomX = this.width / (bounds.hw * 2);
    const fitZoomY = this.height / (bounds.hh * 2);
    const dynamicZoomMin = Math.max(Math.min(fitZoomX, fitZoomY) * 0.8, 0.05);

    // Velocity-based zoom with rubber banding
    const zoomActive = Math.abs(this.zoomVelocity) > 0.00001;
    const clampedZoom = clamp(this.camera.zoom, dynamicZoomMin, ZOOM_MAX);
    const zoomOOB = Math.abs(this.camera.zoom - clampedZoom) > 0.001;

    if (zoomActive || zoomOOB) {
      const [focalWX, focalWY] = this.screenToWorld(this.zoomFocalScreenX, this.zoomFocalScreenY);

      this.camera.zoom = clamp(this.camera.zoom + this.zoomVelocity, dynamicZoomMin * 0.5, ZOOM_MAX * 1.3);

      const springForce = (clamp(this.camera.zoom, dynamicZoomMin, ZOOM_MAX) - this.camera.zoom) * ZOOM_SNAP_BACK_STIFFNESS;
      this.zoomVelocity += springForce;
      this.zoomVelocity *= ZOOM_FRICTION;

      if (Math.abs(this.zoomVelocity) < 0.00001) this.zoomVelocity = 0;

      if (!zoomActive && Math.abs(this.camera.zoom - clampedZoom) < 0.002) {
        this.camera.zoom = clampedZoom;
      }

      this.camera.x = focalWX - (this.zoomFocalScreenX - this.width / 2) / this.camera.zoom;
      this.camera.y = focalWY - (this.zoomFocalScreenY - this.height / 2) / this.camera.zoom;
    }

    // Pan bounding: spring the camera back toward node bounds
    const viewHW = (this.width / 2) / this.camera.zoom;
    const viewHH = (this.height / 2) / this.camera.zoom;
    const panMinX = bounds.cx - bounds.hw + viewHW;
    const panMaxX = bounds.cx + bounds.hw - viewHW;
    const panMinY = bounds.cy - bounds.hh + viewHH;
    const panMaxY = bounds.cy + bounds.hh - viewHH;

    const snapStrength = this.dragging ? 0.02 : 0.08;

    if (panMinX > panMaxX) {
      // Viewport wider than bounds — center
      const target = bounds.cx;
      this.camera.x += (target - this.camera.x) * snapStrength;
    } else {
      if (this.camera.x < panMinX) this.camera.x += (panMinX - this.camera.x) * snapStrength;
      if (this.camera.x > panMaxX) this.camera.x += (panMaxX - this.camera.x) * snapStrength;
    }

    if (panMinY > panMaxY) {
      const target = bounds.cy;
      this.camera.y += (target - this.camera.y) * snapStrength;
    } else {
      if (this.camera.y < panMinY) this.camera.y += (panMinY - this.camera.y) * snapStrength;
      if (this.camera.y > panMaxY) this.camera.y += (panMaxY - this.camera.y) * snapStrength;
    }
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.camera.x) * this.camera.zoom + this.width / 2,
      (wy - this.camera.y) * this.camera.zoom + this.height / 2,
    ];
  }

  /** Smoothly animate camera to fit all nodes on screen */
  zoomToFit() {
    const bounds = this.getNodeBounds();
    const fitZoomX = this.width / (bounds.hw * 2);
    const usableHeight = this.height - this.topMargin;
    const fitZoomY = usableHeight / (bounds.hh * 2);
    const targetZoom = Math.max(Math.min(fitZoomX, fitZoomY) * 1.05, 0.05);
    // Offset camera so nodes center in the usable area below the top margin
    const targetY = bounds.cy - this.topMargin / (2 * targetZoom);
    this.zoomToFitTarget = { x: bounds.cx, y: targetY, zoom: targetZoom };
    this.panVelocityX = 0;
    this.panVelocityY = 0;
    this.zoomVelocity = 0;
    this.followTarget = null;
  }

  // ===== Rendering =====

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Background
    ctx.fillStyle = "#000408";
    ctx.fillRect(0, 0, this.width, this.height);

    const grad = ctx.createRadialGradient(
      this.width / 2, this.height / 2, 0,
      this.width / 2, this.height / 2, this.width * 0.7,
    );
    grad.addColorStop(0, "rgba(10, 15, 30, 0.6)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    const wts = this.worldToScreen.bind(this);
    renderStars(ctx, this.stars, this.camera, this.width, this.height, this.time);
    renderSamples(ctx, this.nodes, this.camera, this.width, this.height, this.time, wts, this.highlightedNodeIds ?? undefined);
    renderSelectionRing(ctx, this.selectionRing, wts, this.camera.zoom);
    renderHUD(ctx, this.width, this.height, this.nodes.length, this.hoveredNode, this.selectionRing.node);

    ctx.restore();
  }
}
