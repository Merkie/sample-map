export interface SampleNode {
  id: string;
  name: string;
  relativePath: string;
  category: string;
  zone: "kick" | "hihat" | "snare" | "perc";
  color: string;

  // t-SNE target positions (scaled to world units)
  tsneX: number;
  tsneY: number;

  // d3-force simulation positions
  x: number;
  y: number;
  vx: number;
  vy: number;

  // Rendering
  glow: number;
  hovered: boolean;
}
