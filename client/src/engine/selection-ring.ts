import type { SampleNode } from "./types";
import {
  RING_VERTEX_COUNT,
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  RING_BASE_STIFFNESS,
  RING_STIFFNESS_VARIATION,
  RING_DAMPING,
  RING_NEAR_BOOST,
  RING_STRETCH_RANGE,
  RING_APPEAR_SPEED,
  RING_MAX_DELAY,
  RING_INNER_STIFFNESS_MULT,
  RING_OUTER_STIFFNESS_MULT,
} from "./constants";

const MIN_THICKNESS = RING_OUTER_RADIUS - RING_INNER_RADIUS;

interface VertexState {
  ix: number; iy: number;   // inner world position
  ivx: number; ivy: number; // inner velocity
  ox: number; oy: number;   // outer world position
  ovx: number; ovy: number; // outer velocity
  stiffBase: number;
  delay: number;             // seconds before this vertex starts responding
}

export interface SelectionRingState {
  active: boolean;
  node: SampleNode | null;
  visibility: number;
  targetVisibility: number;
  vertices: VertexState[];
}

export function createSelectionRing(): SelectionRingState {
  const vertices: VertexState[] = [];
  for (let i = 0; i < RING_VERTEX_COUNT; i++) {
    const phase = (i / RING_VERTEX_COUNT) * Math.PI * 2;
    const offset = Math.sin(phase * 2.7 + 1.3) * RING_STIFFNESS_VARIATION;
    vertices.push({
      ix: 0, iy: 0, ivx: 0, ivy: 0,
      ox: 0, oy: 0, ovx: 0, ovy: 0,
      stiffBase: RING_BASE_STIFFNESS + offset,
      delay: 0,
    });
  }
  return {
    active: false,
    node: null,
    visibility: 0,
    targetVisibility: 0,
    vertices,
  };
}

export function selectNode(ring: SelectionRingState, node: SampleNode): void {
  const wasActive = ring.active;
  ring.active = true;
  ring.node = node;
  ring.targetVisibility = 1;

  if (!wasActive) {
    // First appearance — all vertices start at node center, spring outward
    ring.visibility = 0;
    for (const v of ring.vertices) {
      v.ix = node.x; v.iy = node.y;
      v.ox = node.x; v.oy = node.y;
      v.ivx = 0; v.ivy = 0;
      v.ovx = 0; v.ovy = 0;
      v.delay = 0;
    }
  } else {
    // Jumping — set per-vertex delay based on distance to new target.
    // Far (back) vertices wait longer before they start responding.
    for (let i = 0; i < RING_VERTEX_COUNT; i++) {
      const v = ring.vertices[i];
      const angle = (i / RING_VERTEX_COUNT) * Math.PI * 2 - Math.PI / 2;
      const tix = node.x + Math.cos(angle) * RING_INNER_RADIUS;
      const tiy = node.y + Math.sin(angle) * RING_INNER_RADIUS;
      const dist = Math.sqrt((tix - v.ix) ** 2 + (tiy - v.iy) ** 2);
      v.delay = Math.min(dist / RING_STRETCH_RANGE, 1) * RING_MAX_DELAY;
    }
  }
}

export function dismissRing(ring: SelectionRingState): void {
  ring.targetVisibility = 0;
}

export function updateSelectionRing(ring: SelectionRingState, dt: number): void {
  if (!ring.active) return;
  const node = ring.node;
  if (!node) return;

  // Smooth visibility transition
  const visDiff = ring.targetVisibility - ring.visibility;
  ring.visibility += visDiff * Math.min(1, RING_APPEAR_SPEED * dt);

  if (ring.visibility < 0.005 && ring.targetVisibility === 0) {
    ring.active = false;
    ring.node = null;
    ring.visibility = 0;
    return;
  }

  const innerR = RING_INNER_RADIUS * ring.visibility;
  const outerR = RING_OUTER_RADIUS * ring.visibility;
  const minThick = MIN_THICKNESS * ring.visibility;

  for (let i = 0; i < RING_VERTEX_COUNT; i++) {
    const v = ring.vertices[i];
    const angle = (i / RING_VERTEX_COUNT) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Tick down delay — while waiting, just drift on current velocity
    if (v.delay > 0) {
      v.delay = Math.max(0, v.delay - dt);
      v.ivx *= 0.97;
      v.ivy *= 0.97;
      v.ix += v.ivx * dt;
      v.iy += v.ivy * dt;
      v.ovx *= 0.97;
      v.ovy *= 0.97;
      v.ox += v.ovx * dt;
      v.oy += v.ovy * dt;
      continue;
    }

    // Target positions around the node
    const tix = node.x + cos * innerR;
    const tiy = node.y + sin * innerR;
    const tox = node.x + cos * outerR;
    const toy = node.y + sin * outerR;

    // Distance to target — closer vertices get much higher stiffness
    const idx = tix - v.ix;
    const idy = tiy - v.iy;
    const iDist = Math.sqrt(idx * idx + idy * idy);
    const odx = tox - v.ox;
    const ody = toy - v.oy;
    const oDist = Math.sqrt(odx * odx + ody * ody);

    const iCloseness = 1 - Math.min(iDist / RING_STRETCH_RANGE, 1);
    const oCloseness = 1 - Math.min(oDist / RING_STRETCH_RANGE, 1);

    const iDistFactor = 1 + RING_NEAR_BOOST * iCloseness * iCloseness;
    const oDistFactor = 1 + RING_NEAR_BOOST * oCloseness * oCloseness;

    const iStiff = v.stiffBase * RING_INNER_STIFFNESS_MULT * iDistFactor;
    const oStiff = v.stiffBase * RING_OUTER_STIFFNESS_MULT * oDistFactor;

    // Power-scaled damping — close vertices get a subtle landing jiggle,
    // far vertices stay wobbly for the trailing stretch
    const iDamp = RING_DAMPING * Math.pow(iDistFactor, 0.75);
    const oDamp = RING_DAMPING * Math.pow(oDistFactor, 0.75);

    // Spring physics
    v.ivx += (idx * iStiff - v.ivx * iDamp) * dt;
    v.ivy += (idy * iStiff - v.ivy * iDamp) * dt;
    v.ix += v.ivx * dt;
    v.iy += v.ivy * dt;

    v.ovx += (odx * oStiff - v.ovx * oDamp) * dt;
    v.ovy += (ody * oStiff - v.ovy * oDamp) * dt;
    v.ox += v.ovx * dt;
    v.oy += v.ovy * dt;

    // Enforce minimum thickness: outer must not be closer to center than inner
    const dx = v.ox - v.ix;
    const dy = v.oy - v.iy;
    const thickness = Math.sqrt(dx * dx + dy * dy);
    if (thickness < minThick && minThick > 0) {
      v.ox = v.ix + cos * minThick;
      v.oy = v.iy + sin * minThick;
      const relVx = v.ovx - v.ivx;
      const relVy = v.ovy - v.ivy;
      const radialVel = relVx * cos + relVy * sin;
      if (radialVel < 0) {
        v.ovx -= radialVel * cos;
        v.ovy -= radialVel * sin;
      }
    }
  }
}
