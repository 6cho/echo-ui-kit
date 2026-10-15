import { toHex, toOklch } from "./convert";

/**
 * The lightness ladder every neutral ramp in the kit is built on.
 *
 * These are the OKLCH lightnesses of Tailwind's zinc scale. Borrowed rather than invented because
 * they are already the spacing the rest of the interface is designed against, and because a ramp
 * whose steps are evenly spaced in lightness looks wrong — the eye needs the light end to crowd
 * together and the dark end to spread out, which is what these do.
 */
export const NEUTRAL_SCALE: { step: number; lightness: number }[] = [
  { step: 50, lightness: 0.985 },
  { step: 100, lightness: 0.967 },
  { step: 200, lightness: 0.92 },
  { step: 300, lightness: 0.871 },
  { step: 400, lightness: 0.705 },
  { step: 500, lightness: 0.552 },
  { step: 600, lightness: 0.442 },
  { step: 700, lightness: 0.37 },
  { step: 800, lightness: 0.274 },
  { step: 900, lightness: 0.21 },
];

// Enough hue to belong to the palette, little enough to still read as grey. Past about 0.03 a
// neutral stops looking tinted and starts looking like a colour, at which point it is competing
// with the palette rather than supporting it.
const NEUTRAL_CHROMA = 0.016;
// The lightest steps take less: at 98% lightness the same chroma reads as a wash of colour rather
// than a tint, and pale surfaces are most of an interface's area.
const PALE_NEUTRAL_CHROMA = 0.007;
const PALE_THRESHOLD = 0.9;
// A colour this saturated lends its full tint; below that the tint fades in proportion, so a
// nearly grey palette produces nearly grey neutrals instead of crossing a threshold.
const FULL_TINT_CHROMA = 0.08;

export interface NeutralStep {
  step: number;
  hex: string;
}

/**
 * A ramp of near-greys carrying the palette's hue.
 *
 * Derived rather than picked, and deliberately not part of the palette. A real interface is
 * mostly neutral — page, card, divider, body copy — and a palette asked to supply those as well
 * as its accents ends up either too long to be a palette or too colourful to be an interface.
 * Tinting the greys toward the palette's hue is what keeps them from looking like a separate
 * decision bolted on beside it.
 *
 * Only hue and chroma come from the source. Every lightness is this ladder's own, which is what
 * makes the contrast between any two steps predictable regardless of what colour went in.
 */
export function deriveNeutrals(source: string): NeutralStep[] {
  let hue = 0;
  let strength = 0;
  try {
    const base = toOklch(source);
    hue = base.h ?? 0;
    // An achromatic source has no hue to lend — culori's hue for one is whatever fell out of the
    // conversion — so it produces true greys rather than a tint in an arbitrary direction.
    strength = Math.min(1, (base.c ?? 0) / FULL_TINT_CHROMA);
  } catch {
    // An unparseable source still gets a usable ramp, just a colourless one.
  }

  return NEUTRAL_SCALE.map(({ step, lightness }) => ({
    step,
    hex: toHex({
      mode: "oklch",
      l: lightness,
      c:
        (lightness > PALE_THRESHOLD ? PALE_NEUTRAL_CHROMA : NEUTRAL_CHROMA) *
        strength,
      h: hue,
    }),
  }));
}
