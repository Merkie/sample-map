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
  RING_INNER_STIFFNESS_MULT,
  RING_OUTER_STIFFNESS_MULT,
  RING_NEIGHBOR_STIFFNESS,
  RING_NEIGHBOR_DAMPING,
} from "./constants";

const MIN_THICKNESS = RING_OUTER_RADIUS - RING_INNER_RADIUS;

interface VertexState {
  ix: number; iy: number;   // inner world position
  ivx: number; ivy: number; // inner velocity
  ox: number; oy: number;   // outer world position
  ovx: number; ovy: number; // outer velocity
  stiffBase: number;
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
    }
  }
  // When already active, vertices spring to the new target naturally — no delays
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

  // Phase 1: Compute all forces (read positions before modifying any)
  const forces: { iFx: number; iFy: number; oFx: number; oFy: number }[] = [];

  for (let i = 0; i < RING_VERTEX_COUNT; i++) {
    const v = ring.vertices[i];
    const angle = (i / RING_VERTEX_COUNT) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Target positions around the node
    const tix = node.x + cos * innerR;
    const tiy = node.y + sin * innerR;
    const tox = node.x + cos * outerR;
    const toy = node.y + sin * outerR;

    // Displacement to target
    const idx = tix - v.ix;
    const idy = tiy - v.iy;
    const iDist = Math.sqrt(idx * idx + idy * idy);
    const odx = tox - v.ox;
    const ody = toy - v.oy;
    const oDist = Math.sqrt(odx * odx + ody * ody);

    // Distance-based stiffness: close vertices snap faster (leading edge),
    // far vertices lag behind (trailing edge → stretchy tail)
    const iCloseness = 1 - Math.min(iDist / RING_STRETCH_RANGE, 1);
    const oCloseness = 1 - Math.min(oDist / RING_STRETCH_RANGE, 1);

    const iDistFactor = 1 + RING_NEAR_BOOST * iCloseness * iCloseness;
    const oDistFactor = 1 + RING_NEAR_BOOST * oCloseness * oCloseness;

    const iStiff = v.stiffBase * RING_INNER_STIFFNESS_MULT * iDistFactor;
    const oStiff = v.stiffBase * RING_OUTER_STIFFNESS_MULT * oDistFactor;

    // Power-scaled damping — close vertices damp more (clean landing),
    // far vertices damp less (wobbly trailing stretch)
    const iDamp = RING_DAMPING * Math.pow(iDistFactor, 0.75);
    const oDamp = RING_DAMPING * Math.pow(oDistFactor, 0.75);

    // Spring force toward target
    let iFx = idx * iStiff - v.ivx * iDamp;
    let iFy = idy * iStiff - v.ivy * iDamp;
    let oFx = odx * oStiff - v.ovx * oDamp;
    let oFy = ody * oStiff - v.ovy * oDamp;

    // Neighbor cohesion: pull toward midpoint of adjacent vertices
    const prev = ring.vertices[(i - 1 + RING_VERTEX_COUNT) % RING_VERTEX_COUNT];
    const next = ring.vertices[(i + 1) % RING_VERTEX_COUNT];

    // Inner cohesion
    const iMidX = (prev.ix + next.ix) / 2;
    const iMidY = (prev.iy + next.iy) / 2;
    iFx += (iMidX - v.ix) * RING_NEIGHBOR_STIFFNESS;
    iFy += (iMidY - v.iy) * RING_NEIGHBOR_STIFFNESS;

    // Neighbor velocity damping (reduces relative velocity → prevents striping)
    iFx += (prev.ivx + next.ivx - v.ivx * 2) * RING_NEIGHBOR_DAMPING;
    iFy += (prev.ivy + next.ivy - v.ivy * 2) * RING_NEIGHBOR_DAMPING;

    // Outer cohesion
    const oMidX = (prev.ox + next.ox) / 2;
    const oMidY = (prev.oy + next.oy) / 2;
    oFx += (oMidX - v.ox) * RING_NEIGHBOR_STIFFNESS;
    oFy += (oMidY - v.oy) * RING_NEIGHBOR_STIFFNESS;

    oFx += (prev.ovx + next.ovx - v.ovx * 2) * RING_NEIGHBOR_DAMPING;
    oFy += (prev.ovy + next.ovy - v.ovy * 2) * RING_NEIGHBOR_DAMPING;

    forces.push({ iFx, iFy, oFx, oFy });
  }

  // Phase 2: Integrate all vertices
  for (let i = 0; i < RING_VERTEX_COUNT; i++) {
    const v = ring.vertices[i];
    const f = forces[i];
    const angle = (i / RING_VERTEX_COUNT) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    v.ivx += f.iFx * dt;
    v.ivy += f.iFy * dt;
    v.ix += v.ivx * dt;
    v.iy += v.ivy * dt;

    v.ovx += f.oFx * dt;
    v.ovy += f.oFy * dt;
    v.ox += v.ovx * dt;
    v.oy += v.ovy * dt;

    // Enforce minimum thickness: outer must not collapse inside inner
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
