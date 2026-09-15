import { formatHex } from "culori";
import { toOklch } from "./convert";

export interface ScaleStep {
  step: number;
  hex: string;
}

// Exported (not just a local default) so every consumer that needs "the standard scale steps" —
// ColorScaleGrid's own rendering, PaletteGenerator's role-based seeding — shares the exact same
// array, rather than each hand-maintaining its own copy that can silently drift out of sync. The
// step-to-lightness math below is normalized against a step's *position within this array*, so
// two different "default steps" arrays produce different hex values for the same nominal step
// number — which is exactly the bug that motivated exporting this in the first place.
export const DEFAULT_TINT_SHADE_STEPS = [
  100, 200, 300, 400, 500, 600, 700, 800, 900,
];

const LIGHTNESS_FLOOR = 0.02;
const LIGHTNESS_CEILING = 0.98;

/**
 * Tailwind-style 100-900 tint/shade ramp, walked in OKLCH so perceived lightness
 * steps evenly (a plain hex/HSL lerp visibly bunches up at one end).
 */
export function generateTintShadeScale(
  baseColor: string,
  steps: number[] = DEFAULT_TINT_SHADE_STEPS,
): ScaleStep[] {
  const base = toOklch(baseColor);
  const anchorIndex = steps.indexOf(500);
  const anchor =
    anchorIndex === -1 ? Math.floor(steps.length / 2) : anchorIndex;

  return steps.map((step, i) => {
    const span = i < anchor ? anchor : Math.max(steps.length - 1 - anchor, 1);
    const t = (i - anchor) / span;

    // Linearly interpolate from base.l (t=0, the anchor step) toward the floor/ceiling — not
    // scale base.l by a shrinking factor. Scaling degenerates for near-black or near-white base
    // colors (e.g. base.l=0 makes every darker step compute to exactly 0 regardless of t, so
    // five different "steps" all render the identical hex and all look selected together when
    // only one hex is actually in the selection). Interpolating toward a fixed endpoint instead
    // keeps every step's lightness distinct no matter how extreme the base color is.
    const target = t < 0 ? LIGHTNESS_CEILING : LIGHTNESS_FLOOR;
    const lightness = base.l + Math.abs(t) * (target - base.l);

    const hex = formatHex({
      ...base,
      l: Math.min(0.98, Math.max(0.02, lightness)),
    });
    return { step, hex };
  });
}
