export type MarkerShape = "circle" | "triangle" | "pentagon" | "hexagon" | "star";

// Increasing geometric complexity as a visual metaphor for settlement growth: a village is
// a single point, a metropolis is the "hero" shape. Auto-scales to however many tiers are
// configured via the same rank-interpolation approach tierColorScale uses, rather than
// assuming exactly 5.
const SHAPE_STEPS: MarkerShape[] = ["circle", "triangle", "pentagon", "hexagon", "star"];

export function tierShapeScale(rules: { id: string; order: number }[]): Record<string, MarkerShape> {
  const sorted = [...rules].sort((a, b) => a.order - b.order);
  const n = sorted.length;
  const scale: Record<string, MarkerShape> = { unknown: "circle" };
  sorted.forEach((rule, i) => {
    // i=0 (lowest order, e.g. Metropolis) -> star (most complex), last -> circle (simplest).
    const stepIndex = n <= 1 ? SHAPE_STEPS.length - 1 : Math.round(((n - 1 - i) / (n - 1)) * (SHAPE_STEPS.length - 1));
    scale[rule.id] = SHAPE_STEPS[stepIndex];
  });
  return scale;
}

function regularPolygonPoints(cx: number, cy: number, r: number, sides: number, rotationDeg = -90): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (rotationDeg + (360 / sides) * i) * (Math.PI / 180);
    points.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return points.join(" ");
}

function starPoints(cx: number, cy: number, outerR: number, points = 5, rotationDeg = -90): string {
  const innerR = outerR * 0.45;
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (rotationDeg + (360 / (points * 2)) * i) * (Math.PI / 180);
    coords.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return coords.join(" ");
}

/** Returns SVG <polygon> points for a shape, or null for "circle" (render a <circle> instead).
 * Radius multipliers compensate for polygons with fewer sides looking visually smaller than
 * a circle of the same nominal radius. */
export function shapePoints(shape: MarkerShape, cx: number, cy: number, r: number): string | null {
  switch (shape) {
    case "circle":
      return null;
    case "triangle":
      return regularPolygonPoints(cx, cy, r * 1.25, 3);
    case "pentagon":
      return regularPolygonPoints(cx, cy, r * 1.1, 5);
    case "hexagon":
      return regularPolygonPoints(cx, cy, r * 1.05, 6);
    case "star":
      return starPoints(cx, cy, r * 1.4, 5);
  }
}
