import type { SampleNode } from "./types";
import type { Camera } from "./camera";
import type { SelectionRingState } from "./selection-ring";
import { hexToRgb } from "./utils";
import { SAMPLE_RADIUS, RING_VERTEX_COUNT } from "./constants";

type Star = { x: number; y: number; b: number; s: number; d: number };
type WorldToScreen = (wx: number, wy: number) => [number, number];

const STAR_PARALLAX = [0.03, 0.12, 0.28, 0.85];
const STAR_ZOOM = [0.08, 0.25, 0.5, 0.9];

export function renderStars(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  camera: Camera,
  width: number,
  height: number,
  time: number,
): void {
  const cx = width / 2;
  const cy = height / 2;

  for (const star of stars) {
    const starX = (star.x * 2 - 0.5) * width;
    const starY = (star.y * 2 - 0.5) * height;
    const panStr = STAR_PARALLAX[star.d];
    const zoomStr = STAR_ZOOM[star.d];
    const px = camera.x * panStr;
    const py = camera.y * panStr;
    const zf = 1 + (camera.zoom - 1) * zoomStr;

    const sx = cx + (starX - cx - px) * zf;
    const sy = cy + (starY - cy - py) * zf;

    if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10) continue;

    const twinkle = 0.5 + 0.5 * Math.sin(time * (0.3 + star.b) + star.x * 0.1);
    ctx.globalAlpha = star.b * twinkle;
    ctx.fillStyle = "#c8d8ff";
    ctx.beginPath();
    ctx.arc(sx, sy, star.s * zf, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function renderSamples(
  ctx: CanvasRenderingContext2D,
  nodes: SampleNode[],
  camera: Camera,
  width: number,
  height: number,
  time: number,
  worldToScreen: WorldToScreen,
  highlightedIds?: Set<string>,
): void {
  const radius = SAMPLE_RADIUS * camera.zoom;
  const dimming = highlightedIds != null && highlightedIds.size > 0;

  // Glow pass (additive blending)
  ctx.globalCompositeOperation = "lighter";
  for (const node of nodes) {
    const [x, y] = worldToScreen(node.x, node.y);
    if (x < -50 || x > width + 50 || y < -50 || y > height + 50) continue;

    const dimFactor = dimming && !highlightedIds.has(node.id) ? 0.35 : 1;
    const [r, g, b] = hexToRgb(node.color);
    const pulse = 0.5 + 0.5 * Math.sin(time * 2 + node.tsneX * 0.05);
    const baseGlow = 0.04 + pulse * 0.03;
    const glowAlpha = (baseGlow + node.glow * 0.25) * dimFactor;
    const glowWorld = SAMPLE_RADIUS * (2.5 + node.glow * 4);
    const glowSize = glowWorld * Math.min(camera.zoom, 1.2);

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha})`;
    ctx.beginPath();
    ctx.arc(x, y, glowSize, 0, Math.PI * 2);
    ctx.fill();

    if (node.glow > 0.1) {
      const innerGlow = node.glow;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${innerGlow * 0.35 * dimFactor})`;
      const innerWorld = SAMPLE_RADIUS * (1.8 + innerGlow * 1.5);
      const innerSize = innerWorld * Math.min(camera.zoom, 1.2);
      ctx.beginPath();
      ctx.arc(x, y, innerSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";

  // Solid cores
  for (const node of nodes) {
    const [x, y] = worldToScreen(node.x, node.y);
    if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue;

    const dimFactor = dimming && !highlightedIds.has(node.id) ? 0.35 : 1;
    const [r, g, b] = hexToRgb(node.color);

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.85 + node.glow * 0.15) * dimFactor})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Hot white center
    const centerAlpha = (0.35 + node.glow * 0.5) * dimFactor;
    ctx.fillStyle = `rgba(255, 255, 255, ${centerAlpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();


  }
}

export function renderSequencerPolygon(
  ctx: CanvasRenderingContext2D,
  vertices: Array<{ x: number; y: number }>,
  worldToScreen: WorldToScreen,
): void {
  if (vertices.length < 2) return;

  // Sort by angle from centroid for non-self-intersecting polygon
  let cx = 0, cy = 0;
  for (const v of vertices) { cx += v.x; cy += v.y; }
  cx /= vertices.length;
  cy /= vertices.length;

  const sorted = [...vertices].sort((a, b) =>
    Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );

  const pts = sorted.map(v => worldToScreen(v.x, v.y));

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "rgba(255, 255, 255, 0.2)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function renderSelectionRing(
  ctx: CanvasRenderingContext2D,
  ring: SelectionRingState,
  worldToScreen: WorldToScreen,
  zoom: number,
): void {
  if (!ring.active || ring.visibility < 0.01) return;

  const innerPts: [number, number][] = [];
  const outerPts: [number, number][] = [];

  for (let i = 0; i < RING_VERTEX_COUNT; i++) {
    const v = ring.vertices[i];
    innerPts.push(worldToScreen(v.ix, v.iy));
    outerPts.push(worldToScreen(v.ox, v.oy));
  }

  const alpha = ring.visibility * 0.6;

  // Soft outer glow
  ctx.save();
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.5})`;
  ctx.shadowBlur = 8 * Math.min(zoom, 1.2);

  // Ring fill: outer path + inner hole via even-odd
  ctx.beginPath();
  ctx.moveTo(outerPts[0][0], outerPts[0][1]);
  for (let i = 1; i < RING_VERTEX_COUNT; i++) {
    ctx.lineTo(outerPts[i][0], outerPts[i][1]);
  }
  ctx.closePath();
  ctx.moveTo(innerPts[0][0], innerPts[0][1]);
  for (let i = RING_VERTEX_COUNT - 1; i >= 0; i--) {
    ctx.lineTo(innerPts[i][0], innerPts[i][1]);
  }
  ctx.closePath();

  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fill("evenodd");
  ctx.restore();

  // Thin outer stroke
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.35})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(outerPts[0][0], outerPts[0][1]);
  for (let i = 1; i < RING_VERTEX_COUNT; i++) {
    ctx.lineTo(outerPts[i][0], outerPts[i][1]);
  }
  ctx.closePath();
  ctx.stroke();
}

const ZONE_COLORS: Record<string, string> = {
  kick: "#ef4444",
  hihat: "#22c55e",
  snare: "#3b82f6",
  perc: "#eab308",
};

/** Andrew's monotone chain convex hull — returns points in CCW order */
function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0)
      upper.pop();
    upper.push(pts[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Sutherland-Hodgman: clip polygon to the half-plane closer to `a` than `b`.
 *  margin shifts the bisector toward `b`, giving `a` extra room. */
function clipByBisector(poly: [number, number][], a: [number, number], b: [number, number], margin = 0): [number, number][] {
  if (poly.length === 0) return poly;
  // Normal pointing toward a (not normalized — only sign matters for inside/outside)
  const nx = a[0] - b[0];
  const ny = a[1] - b[1];
  const len = Math.sqrt(nx * nx + ny * ny) || 1;
  // Midpoint shifted toward b by margin
  const mx = (a[0] + b[0]) / 2 - (nx / len) * margin;
  const my = (a[1] + b[1]) / 2 - (ny / len) * margin;

  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const dCur = (cur[0] - mx) * nx + (cur[1] - my) * ny;
    const dNxt = (nxt[0] - mx) * nx + (nxt[1] - my) * ny;

    if (dCur >= 0) {
      out.push(cur);
      if (dNxt < 0) {
        const t = dCur / (dCur - dNxt);
        out.push([cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1])]);
      }
    } else if (dNxt >= 0) {
      const t = dCur / (dCur - dNxt);
      out.push([cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1])]);
    }
  }
  return out;
}

export function renderZoneBorders(
  ctx: CanvasRenderingContext2D,
  nodes: SampleNode[],
  worldToScreen: WorldToScreen,
  zoom: number,
): void {
  // Group nodes by zone
  const byZone = new Map<string, [number, number][]>();
  for (const node of nodes) {
    if (!node.zone) continue;
    const list = byZone.get(node.zone) || [];
    list.push([node.x, node.y]);
    byZone.set(node.zone, list);
  }

  // Compute zone centroids
  const zoneCentroids = new Map<string, [number, number]>();
  for (const [zone, points] of byZone) {
    let sx = 0, sy = 0;
    for (const [x, y] of points) { sx += x; sy += y; }
    zoneCentroids.set(zone, [sx / points.length, sy / points.length]);
  }

  for (const [zone, points] of byZone) {
    if (points.length < 3) continue;

    const hull = convexHull(points);
    if (hull.length < 3) continue;

    const [cx, cy] = zoneCentroids.get(zone)!;

    // Expand hull outward with uniform padding
    const padding = 14;
    const expanded: [number, number][] = hull.map(([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      return [x + (dx / dist) * padding, y + (dy / dist) * padding];
    });

    // Clip against perpendicular bisector with every other zone — splits contested space down the middle
    // margin=8 shifts bisector toward the other zone, giving each zone breathing room for d3-force drift
    let clipped = expanded;
    const myCenter = zoneCentroids.get(zone)!;
    for (const [otherZone, otherCenter] of zoneCentroids) {
      if (otherZone === zone) continue;
      clipped = clipByBisector(clipped, myCenter, otherCenter, 8);
      if (clipped.length < 3) break;
    }
    if (clipped.length < 3) continue;

    const screenPts = clipped.map(([x, y]) => worldToScreen(x, y));
    const color = ZONE_COLORS[zone] || "#888";

    // Draw smooth border
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    const n = screenPts.length;
    const midX = (screenPts[n - 1][0] + screenPts[0][0]) / 2;
    const midY = (screenPts[n - 1][1] + screenPts[0][1]) / 2;
    ctx.moveTo(midX, midY);
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const mx = (screenPts[i][0] + screenPts[next][0]) / 2;
      const my = (screenPts[i][1] + screenPts[next][1]) / 2;
      ctx.quadraticCurveTo(screenPts[i][0], screenPts[i][1], mx, my);
    }
    ctx.closePath();
    ctx.stroke();

    // Fill with very low alpha
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = color;
    ctx.fill();

    // Zone label at centroid
    const [labelX, labelY] = worldToScreen(cx, cy);
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(10, Math.min(13, 11 * zoom))}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(zone.toUpperCase(), labelX, labelY);
    ctx.restore();
  }
}

export function renderHUD(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sampleCount: number,
  hoveredNode: SampleNode | null,
  selectedNode: SampleNode | null,
): void {
  // Sample count (bottom right)
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.font = "12px monospace";
  ctx.fillText(`${sampleCount} samples`, width - 24, height - 16);

  // Tooltip (bottom left) — hover takes priority, then ring selection
  const displayNode = hoveredNode || selectedNode;
  if (displayNode) {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "12px monospace";
    ctx.fillText(displayNode.relativePath, 24, height - 16);

    const [r, g, b] = hexToRgb(displayNode.color);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
    ctx.font = "11px monospace";
    ctx.fillText(displayNode.category, 24, height - 34);
  }
}
