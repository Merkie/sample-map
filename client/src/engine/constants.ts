// Category → color mapping
export const CATEGORY_COLORS: Record<string, string> = {
  Kick: "#ef4444",
  kick: "#ef4444",
  Snare: "#3b82f6",
  snare: "#3b82f6",
  Hat: "#22c55e",
  hat: "#22c55e",
  Bass: "#a855f7",
  bass: "#a855f7",
  SFX: "#eab308",
  sfx: "#eab308",
  Inst: "#06b6d4",
  inst: "#06b6d4",
};

export const DEFAULT_COLOR = "#7c8db5";

// Physics config (d3-force)
export const physicsConfig = {
  positionStrength: 0.12,       // softer pull toward t-SNE targets (links do the clustering)
  chargeStrength: -40,          // base repulsion
  collideRadius: 14,            // prevent overlap
  neighborK: 5,                 // k-nearest neighbors to link
  linkDistanceMin: 8,           // closest neighbors
  linkDistanceMax: 60,          // furthest of the k neighbors
  linkStrength: 0.4,            // how strongly links pull
  velocityDecay: 0.35,          // damping (higher = less jelly)
  preSettleTicks: 400,
};

// t-SNE coordinate scaling (scale raw t-SNE range to ±200 world units)
export const TSNE_SCALE = 200;

// Camera — free mode
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 5;
export const ZOOM_FRICTION = 0.88;
export const ZOOM_SNAP_BACK_STIFFNESS = 0.12;
export const ZOOM_WHEEL_SENSITIVITY = -0.000055;

// Sample dot rendering
export const SAMPLE_RADIUS = 6;
export const SAMPLE_GLOW_DECAY = 2;

// HUD
export const HUD_TITLE = "SAMPLE MAP";

// Selection ring (decagon)
export const RING_VERTEX_COUNT = 32;
export const RING_INNER_RADIUS = 14;
export const RING_OUTER_RADIUS = 20;
export const RING_BASE_STIFFNESS = 180;
export const RING_STIFFNESS_VARIATION = 12;
export const RING_DAMPING = 11;
export const RING_NEAR_BOOST = 8;
export const RING_STRETCH_RANGE = 80;
export const RING_APPEAR_SPEED = 40;
export const RING_MAX_DELAY = 0.08;
export const RING_BOUNCE_DELAY = 0.1;
export const RING_BOUNCE_FREQ = 25;
export const RING_BOUNCE_DECAY = 6;
export const RING_BOUNCE_AMOUNT = 0.15;
export const RING_NAV_MAX_DIST = 300;
export const RING_NAV_CONE_HALF = Math.PI / 3;  // ±60° cone
export const RING_INNER_STIFFNESS_MULT = 1.3;
export const RING_OUTER_STIFFNESS_MULT = 0.85;
