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

/**
 * How tinted the ramp is by default.
 *
 * Not zero, which produces a correct theme that wastes the palette: an interface whose only
 * coloured thing is one button has not been themed, it has been greyscaled with an accent. Not
 * full either — the default wants to suit the most palettes rather than be the most striking.
 */
export const DEFAULT_NEUTRAL_TINT = 0.45;

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
 * makes the contrast between any two steps predictable regardless of what colour went in — and
 * what makes `tint` safe to expose as a control, since turning it up changes how coloured the
 * structure is without changing how light it is.
 */
export function deriveNeutrals(
  source: string,
  tint: number = DEFAULT_NEUTRAL_TINT,
): NeutralStep[] {
  let hue = 0;
  let chroma = 0;
  try {
    const base = toOklch(source);
    hue = base.h ?? 0;
    // Straight from the source, so the far end of the range is the colour's own saturation
    // rather than a ceiling picked here. At full tint this *is* the palette colour's tint and
    // shade scale; at zero it is grey; in between it is the one dial that matters. A colourless
    // source has nothing to lend and stays grey at every setting, with no threshold to cross.
    chroma = base.c ?? 0;
  } catch {
    // An unparseable source still gets a usable ramp, just a colourless one.
  }

  const amount = chroma * Math.min(1, Math.max(0, tint));
  return NEUTRAL_SCALE.map(({ step, lightness }) => ({
    step,
    hex: toHex({ mode: "oklch", l: lightness, c: amount, h: hue }),
  }));
}
