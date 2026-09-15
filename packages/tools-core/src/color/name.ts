import { toHsl } from "./convert";

// Hue buckets in HSL degrees rather than OKLCH, even though OKLCH is what the rest of the palette
// math runs on — these names exist to match what someone would *call* the color out loud, and the
// conventional color-name boundaries (where "blue" stops and "purple" starts) are drawn on the
// HSL/RGB wheel. Ranges are [start, end) walking clockwise from red, with red wrapping past 360.
// Boundaries are calibrated against Tailwind's own palette, since that's the vocabulary this
// audience already has — each of its named hues should come back with (close to) the name
// Tailwind gives it. Verified: blue/indigo/violet/purple/pink land exactly, and the near-misses
// are all reasonable synonyms (amber→orange, emerald→green, sky→blue, fuchsia→magenta,
// rose→red). Note the purple end needs much tighter buckets than the warm end — evenly-spaced
// ranges put Tailwind's violet *and* purple both in "indigo", because perceptual hue names
// aren't evenly distributed around the wheel.
const HUE_NAMES: { name: string; start: number; end: number }[] = [
  { name: "red", start: 345, end: 15 },
  { name: "orange", start: 15, end: 45 },
  { name: "yellow", start: 45, end: 70 },
  { name: "lime", start: 70, end: 100 },
  { name: "green", start: 100, end: 165 },
  { name: "teal", start: 165, end: 185 },
  { name: "cyan", start: 185, end: 197 },
  { name: "blue", start: 197, end: 232 },
  { name: "indigo", start: 232, end: 250 },
  { name: "violet", start: 250, end: 265 },
  { name: "purple", start: 265, end: 285 },
  { name: "magenta", start: 285, end: 310 },
  { name: "pink", start: 310, end: 345 },
];

// Below this saturation a hue name is meaningless — "blue" for something that reads as gray is
// worse than no hue name at all, so these fall through to the lightness-based neutral names.
// Set just above Tailwind's slate (s=0.16), which is a gray with a blue cast and should be named
// as one; anything more saturated than that reads as a real, if muted, hue.
const NEUTRAL_SATURATION = 0.18;
const BLACK_LIGHTNESS = 0.12;
const WHITE_LIGHTNESS = 0.9;

/**
 * The plain-English hue name for a color — "blue", "teal", "gray". Deliberately coarse: a dozen
 * buckets plus neutrals, since the point is a recognizable handle, not a precise description.
 * On its own this is only half a token name; see nameColors for the `hue-step` form that export
 * actually uses.
 */
export function colorName(hex: string): string {
  let h: number;
  let s: number;
  let l: number;
  try {
    const parsed = toHsl(hex);
    h = parsed.h ?? 0;
    s = parsed.s ?? 0;
    l = parsed.l;
  } catch {
    return "color";
  }

  if (s < NEUTRAL_SATURATION) {
    if (l <= BLACK_LIGHTNESS) return "black";
    if (l >= WHITE_LIGHTNESS) return "white";
    return "gray";
  }

  const hue = ((h % 360) + 360) % 360;
  const match = HUE_NAMES.find(({ start, end }) =>
    // Red is the one bucket that wraps past 360, so it needs the opposite test: inside the range
    // means "past the start OR before the end" rather than both at once.
    start > end ? hue >= start || hue < end : hue >= start && hue < end,
  );
  return match?.name ?? "color";
}

// Approximate HSL lightness of each step in a conventional 50–950 ramp, used to label a color
// with the step it most resembles. Anchored on Tailwind's own scale so an exported `blue-500`
// actually sits where a reader expects blue-500 to sit, rather than on an evenly-spaced ramp
// (real scales are compressed at the dark end and stretched at the light end).
const STEP_LIGHTNESS: { step: number; lightness: number }[] = [
  { step: 50, lightness: 0.97 },
  { step: 100, lightness: 0.94 },
  { step: 200, lightness: 0.86 },
  { step: 300, lightness: 0.77 },
  { step: 400, lightness: 0.66 },
  { step: 500, lightness: 0.55 },
  { step: 600, lightness: 0.48 },
  { step: 700, lightness: 0.4 },
  { step: 800, lightness: 0.33 },
  { step: 900, lightness: 0.27 },
  { step: 950, lightness: 0.16 },
];

/** The 50–950 scale step whose lightness this color sits closest to. */
export function lightnessStep(hex: string): number {
  let l: number;
  try {
    l = toHsl(hex).l;
  } catch {
    return 500;
  }
  let closest = STEP_LIGHTNESS[0] as { step: number; lightness: number };
  for (const candidate of STEP_LIGHTNESS) {
    if (Math.abs(candidate.lightness - l) < Math.abs(closest.lightness - l)) {
      closest = candidate;
    }
  }
  return closest.step;
}

/**
 * Names a whole palette at once as `hue-step` pairs — `blue-500`, `blue-900`, `teal-400`.
 *
 * Naming by hue alone collapses badly on exactly the palettes this app produces: a harmony is
 * mostly tints and shades of one or two hues, so you'd get `blue`, `blue-2`, `blue-3`… which
 * carries no more meaning than `color-1`, `color-2` would. The lightness step is the part that
 * actually distinguishes them, and it matches the convention every front-end dev already reads
 * fluently from Tailwind.
 *
 * Pure black and white keep their own names (a step number on them reads as noise). A trailing
 * counter is still appended in the rare case two colors land on the same hue *and* step, since
 * duplicate keys would silently overwrite each other in a CSS block or JSON object.
 */
export function nameColors(hexes: string[]): string[] {
  const counts = new Map<string, number>();
  return hexes.map((hex) => {
    const hue = colorName(hex);
    const base =
      hue === "black" || hue === "white" ? hue : `${hue}-${lightnessStep(hex)}`;
    const seen = (counts.get(base) ?? 0) + 1;
    counts.set(base, seen);
    return seen === 1 ? base : `${base}-${seen}`;
  });
}
