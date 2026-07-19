// Sequential "blue" ramp -- the province/market-size choropleth. Blue is reserved for this
// layer only (see green/yellow-red below) so a settlement dot or competitor marker can never
// visually blend into the province fill beneath it. Low values recede toward the light
// surface, high values are dark and prominent -- kept the SAME direction in both themes
// (higher market size = darker blue, always) rather than flipping for dark-mode contrast;
// marker visibility on dark fills is instead handled by the light outline in SwedenMap.tsx.
export const SEQUENTIAL_BLUE = [
  "#cde2fb", // 100
  "#9ec5f4", // 200
  "#6da7ec", // 300
  "#3987e5", // 400
  "#256abf", // 500
  "#184f95", // 600
  "#0d366b", // 700
];

export const UNKNOWN_TIER_COLOR = "#898781";

// Green ordinal ramp for settlement tiers -- deliberately a different hue family from the
// blue province choropleth (see above) so a settlement marker never coincides with the
// province fill it sits on. Same direction in both themes (higher tier = darker green,
// always) for the same reason as SEQUENTIAL_BLUE above.
const ORDINAL_STEPS = ["#7ec27e", "#5cae5c", "#3f9a3f", "#2a7d2a", "#145c14", "#0a4a0a"];

/** Maps each rule id -> color, darkest for the lowest `order` (evaluated/rarest first). */
export function tierColorScale(rules: { id: string; order: number }[]): Record<string, string> {
  const sorted = [...rules].sort((a, b) => a.order - b.order);
  const n = sorted.length;
  const scale: Record<string, string> = { unknown: UNKNOWN_TIER_COLOR };
  sorted.forEach((rule, i) => {
    // i=0 (lowest order, e.g. Metropolis) -> darkest, last -> lightest.
    const stepIndex = n <= 1 ? ORDINAL_STEPS.length - 1 : Math.round(((n - 1 - i) / (n - 1)) * (ORDINAL_STEPS.length - 1));
    scale[rule.id] = ORDINAL_STEPS[stepIndex];
  });
  return scale;
}

// Fixed per-entity identity color, shared between the map (HQ markers) and the Trends
// chart -- so "Ahlsell" is the same color everywhere. Competitors get yellow/red/orange
// shades (a third hue family, distinct from the blue provinces and green settlements);
// DSEG keeps green since it's "us," not a competitor, matching its own settlement dots.
// Spread across hue (yellow->red) AND lightness/saturation for 10 competitors to stay
// pairwise distinct within one narrow hue wedge -- past 8 series, colorblind-safe
// separation can't be guaranteed by hue alone, so every place this is used also shows the
// name directly (legend, hover tooltip), which is the mitigation for that.
export const COMPETITOR_COLOR: Record<string, string> = {
  dseg: "#008300",
  aprilice: "#ad8b00",
  kp_energy: "#916308",
  krannich_solar: "#bd660f",
  senergia: "#c44f1c",
  ahlsell: "#b31f0f",
  rexel: "#7d1212",
  parkys: "#856100",
  energygroup: "#cc5500",
  solar_sverige: "#6b1f0f",
  sesol: "#9b794b",
};

// Dark-mode counterpart -- brightened versions of the same hues, checked to clear >=3.7:1
// against the dark map surface (#1a1a19); the light-mode values are tuned for the light
// surface instead and read weakly on dark.
export const COMPETITOR_COLOR_DARK: Record<string, string> = {
  dseg: "#008300",
  aprilice: "#ffd83d",
  kp_energy: "#efb239",
  krannich_solar: "#f3ad68",
  senergia: "#ed865a",
  ahlsell: "#ef4b39",
  rexel: "#e02929",
  parkys: "#f5c43d",
  energygroup: "#f48434",
  solar_sverige: "#d94426",
  sesol: "#c6b195",
};

export function competitorColorFor(id: string, mode: "light" | "dark"): string {
  const map = mode === "dark" ? COMPETITOR_COLOR_DARK : COMPETITOR_COLOR;
  return map[id] ?? UNKNOWN_TIER_COLOR;
}

// Status palette (fixed, reserved) -- used for competitor operating status, not identity.
export const STATUS_COLOR: Record<string, string> = {
  active: "#0ca30c", // good
  passive: "#fab219", // warning
  exited: "#898781", // muted -- no longer a threat, not "critical"
  bankrupt: "#898781",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  passive: "Passive",
  exited: "Exited market",
  bankrupt: "Bankrupt",
};

/** Buckets a set of values into N quantile thresholds, returns a lookup fn value -> color. */
export function makeQuantileScale(values: number[], ramp: string[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = ramp.length;
  const thresholds = Array.from({ length: n - 1 }, (_, i) => {
    const idx = Math.floor(((i + 1) / n) * (sorted.length - 1));
    return sorted[idx];
  });

  return (value: number) => {
    let bucket = 0;
    while (bucket < thresholds.length && value > thresholds[bucket]) bucket++;
    return ramp[bucket];
  };
}
