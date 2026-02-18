import {
  forceSimulation,
  forceManyBody,
  forceCollide,
  forceLink,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { SampleNode } from "./types";
import { physicsConfig } from "./constants";

interface SimNode extends SimulationNodeDatum {
  id: string;
  index?: number;
  tsneX: number;
  tsneY: number;
  neighborCount: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  distance: number;
}

let simulation: Simulation<SimNode, SimLink> | null = null;

/** Find k-nearest neighbors per node in t-SNE space and build links */
function buildNeighborLinks(simNodes: SimNode[], k: number): SimLink[] {
  const n = simNodes.length;
  if (n < 2) return [];

  // Compute all pairwise t-SNE distances
  const dists: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = simNodes[i].tsneX - simNodes[j].tsneX;
      const dy = simNodes[i].tsneY - simNodes[j].tsneY;
      dists.push({ i, j, d: Math.sqrt(dx * dx + dy * dy) });
    }
  }

  // For each node, find its k nearest
  const linkSet = new Set<string>();
  const links: SimLink[] = [];
  const neighborCounts = new Array(n).fill(0);

  // Find max distance for normalization
  let maxDist = 0;
  for (const d of dists) maxDist = Math.max(maxDist, d.d);
  if (maxDist === 0) maxDist = 1;

  for (let i = 0; i < n; i++) {
    // Gather distances from node i
    const myDists: { j: number; d: number }[] = [];
    for (const entry of dists) {
      if (entry.i === i) myDists.push({ j: entry.j, d: entry.d });
      else if (entry.j === i) myDists.push({ j: entry.i, d: entry.d });
    }
    myDists.sort((a, b) => a.d - b.d);

    const neighbors = myDists.slice(0, k);
    for (const nb of neighbors) {
      const key = `${Math.min(i, nb.j)}-${Math.max(i, nb.j)}`;
      if (linkSet.has(key)) continue;
      linkSet.add(key);

      // Link distance: close t-SNE neighbors get short links, far ones get longer
      const normalizedDist = nb.d / maxDist;
      const linkDist = physicsConfig.linkDistanceMin +
        normalizedDist * (physicsConfig.linkDistanceMax - physicsConfig.linkDistanceMin);

      links.push({
        source: simNodes[i],
        target: simNodes[nb.j],
        distance: linkDist,
      });

      neighborCounts[i]++;
      neighborCounts[nb.j]++;
    }
  }

  // Write neighbor counts back
  for (let i = 0; i < n; i++) {
    simNodes[i].neighborCount = neighborCounts[i];
  }

  return links;
}

export function createSimulation(nodes: SampleNode[]): void {
  const simNodes: SimNode[] = nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    vx: n.vx,
    vy: n.vy,
    tsneX: n.tsneX,
    tsneY: n.tsneY,
    neighborCount: 0,
  }));

  const links = buildNeighborLinks(simNodes, physicsConfig.neighborK);

  simulation = forceSimulation(simNodes)
    // Pull toward t-SNE positions (softer now that links help with structure)
    .force(
      "x",
      forceX<SimNode>((d) => d.tsneX).strength(physicsConfig.positionStrength),
    )
    .force(
      "y",
      forceY<SimNode>((d) => d.tsneY).strength(physicsConfig.positionStrength),
    )
    // Neighbor links: attract similar samples together
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .distance((l) => l.distance)
        .strength(physicsConfig.linkStrength),
    )
    // Repulsion: stronger for nodes with fewer neighbors (outliers push harder)
    .force(
      "charge",
      forceManyBody<SimNode>()
        .strength((d) => {
          const base = physicsConfig.chargeStrength;
          // Outliers (few neighbors) repel more, well-connected nodes repel less
          const factor = 1 + (physicsConfig.neighborK - d.neighborCount) * 0.15;
          return base * Math.max(factor, 0.5);
        }),
    )
    .force("collide", forceCollide().radius(physicsConfig.collideRadius))
    .velocityDecay(physicsConfig.velocityDecay)
    .stop();
}

export function preSettle(ticks: number): void {
  if (!simulation) return;
  for (let i = 0; i < ticks; i++) {
    simulation.tick();
  }
}

export function tickSimulation(): void {
  if (!simulation) return;
  simulation.tick();
}

export function syncFromSimulation(nodes: SampleNode[]): void {
  if (!simulation) return;
  const simNodes = simulation.nodes();
  for (let i = 0; i < simNodes.length && i < nodes.length; i++) {
    nodes[i].x = simNodes[i].x!;
    nodes[i].y = simNodes[i].y!;
    nodes[i].vx = simNodes[i].vx!;
    nodes[i].vy = simNodes[i].vy!;
  }
}

export function stopSimulation(): void {
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
}
