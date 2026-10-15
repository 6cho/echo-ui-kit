import { contrastRatio } from "../color/contrast";
import { toHex, toOklch } from "../color/convert";

/**
 * The app's own neutral ramp, by lightness.
 *
 * These are the OKLCH lightnesses of Tailwind's zinc scale, which is what the interface is built
 * out of. Keeping them exactly is the point: the tint re-hues the greys without moving a single
 * step's lightness, so every contrast the interface already relies on survives it. A palette can
 * change what colour the chrome is, but it doesn't get to decide whether the text is readable.
 */
const NEUTRAL_STEPS: [step: number, lightness: number][] = [
  [50, 0.985],
  [100, 0.967],
  [200, 0.92],
  [300, 0.871],
  [400, 0.705],
  [500, 0.552],
  [600, 0.442],
  [700, 0.37],
  [800, 0.274],
  [900, 0.21],
];

/**
 * The dark-mode chrome, likewise by lightness — the three tiers the side panel layers with.
 * Measured from the greys they replace (#202124, #2d2e31, #37383c) so the layering keeps its
 * spacing.
 */
const SURFACE_STEPS: [name: string, lightness: number][] = [
  ["surface", 0.262],
  ["surface-elevated", 0.335],
  ["surface-hover", 0.393],
];

// Enough hue to be unmistakable, little enough to still read as grey. Past about 0.03 the
// interface stops looking tinted and starts looking coloured, which fights whatever palette is
// being shown inside it.
const NEUTRAL_CHROMA = 0.016;
// A palette this colourful gets the full tint; below it the tint fades out in proportion. Without
// this the tint was all-or-nothing at a threshold, so dragging the saturation slider down snapped
// the entire interface back to stock blue at one particular value.
const FULL_TINT_CHROMA = 0.08;
// The lightest steps take less: at 98% lightness the same chroma reads as a wash of colour
// rather than a tint, and white-ish surfaces are most of the interface's area.
const PALE_NEUTRAL_CHROMA = 0.007;
const PALE_THRESHOLD = 0.9;

// Filled buttons are brand-600 with white text, so it has to clear AA or the app's own primary
// action becomes unreadable. A pale palette gets its accent darkened until it does.
const ON_PRIMARY = "#ffffff";
const PRIMARY_MIN_CONTRAST = 4.5;
// Where the accent starts before that. The interface's own figure, not the palette's: which entry
// of a scale happens to be the most colourful is an accident of the scale, and for a muted
// palette it is often the darkest step. Inheriting its lightness made the app's primary colour
// follow the palette's *darkness* around, which at the low end produced a black button.
const PRIMARY_LIGHTNESS = 0.55;
// The mark that goes *on* the accent — brand-100. Non-text, so 3:1 is the bar; aiming a little
// past it leaves room for the rounding into sRGB.
const ON_PRIMARY_MIN_CONTRAST = 3.5;
const ON_PRIMARY_START_LIGHTNESS = 0.93;

// The second colour of the theme. Where a palette supplies one — every harmony but monochrome
// has a second column — that is what gets used, because the theme's second colour should be the
// palette's second colour rather than something invented next to it. Failing that it is derived
// by rotating the base, far enough to be plainly a different colour and short of the direct
// complement, which reads as a clash rather than a companion.
const SECONDARY_HUE_SHIFT = 150;
// Around a "300": distinctly lighter than the accent it sits on, without being a tint of it —
// the point is showing that a theme has more than one colour, so it keeps its own hue.
const SECONDARY_LIGHTNESS = 0.78;
const SECONDARY_MAX_CHROMA = 0.13;

export interface AppTheme {
  /** Custom properties to set on the document root. */
  variables: Record<string, string>;
  /** What the app will actually paint its accents with. */
  primary: string;
}

function safeOklch(hex: string) {
  try {
    return toOklch(hex);
  } catch {
    return null;
  }
}

/**
 * Recolours the interface from the colour a palette is built on.
 *
 * From the base colour specifically, not from the palette it produces. Picking the most colourful
 * entry instead sounds reasonable and is wrong: a triadic harmony off a red base contains a green
 * with more chroma than the red, so the app went green while the control that supposedly drove it
 * said red. Every other colour on screen is derived from the base, and the interface is not an
 * exception to that.
 *
 * The app has one accent and a neutral ramp, so that is what a colour can drive. There is no
 * secondary or tertiary here — adding those variables would change nothing, because nothing in
 * the interface paints with them.
 *
 * Only hue and chroma are taken. Every lightness is the interface's own, which is what keeps this
 * a skin rather than a way to make the app illegible with a bad palette.
 */
export function deriveAppTheme(
  source: string,
  secondarySource?: string | null,
): AppTheme | null {
  const base = safeOklch(source);
  if (!base) return null;

  const chroma = base.c ?? 0;
  // culori reports no hue for a colour with no chroma, and sometimes NaN rather than nothing,
  // which `??` lets through. Any hue is as good as any other at zero chroma, so it is pinned.
  const hue = Number.isFinite(base.h) ? (base.h as number) : 0;

  // A grey base still themes the app — grey. This used to bail out and hand the interface back
  // to its stock blue, which made exactly-zero saturation the one value that behaved differently
  // from every value just above it: at 1% the app was a faint warm grey, at 0% it was suddenly
  // blue. With no early return the tint simply fades to nothing, and a palette of greys gets an
  // app of greys.

  // How much of the tint this colour has earned. Full colour gets all of it; a nearly grey one
  // gets nearly none, which is both what it should look like and what stops the effect switching
  // on and off as a saturation slider passes a threshold.
  const strength = Math.min(1, chroma / FULL_TINT_CHROMA);
  const neutralChroma = NEUTRAL_CHROMA * strength;
  const paleChroma = PALE_NEUTRAL_CHROMA * strength;

  const primary = darkenUntilReadable({
    mode: "oklch",
    l: PRIMARY_LIGHTNESS,
    c: chroma,
    h: hue,
  });

  const variables: Record<string, string> = {
    // 500 is the lighter accent the interface uses for rings and marks; 600 is what it fills
    // buttons with. The rest of the ramp is declared but unused — set anyway, so a component
    // that reaches for it later gets a themed value rather than the stock blue.
    "--color-brand-50": toHex({
      mode: "oklch",
      l: 0.97,
      c: chroma * 0.25,
      h: hue,
    }),
    // Less a step on a ramp than a role: whatever reads as a mark on top of the accent.
    "--color-brand-100": lightenUntilVisible(primary, chroma, hue),
    // The theme's other colour, for the places that exist to show there is one.
    "--color-accent-300": secondary(secondarySource, hue, chroma),
    "--color-brand-500": toHex({ mode: "oklch", l: 0.66, c: chroma, h: hue }),
    "--color-brand-600": primary,
    "--color-brand-900": toHex({
      mode: "oklch",
      l: 0.32,
      c: chroma * 0.8,
      h: hue,
    }),
    // A white that isn't quite white. Cards are most of the interface's area in light mode, and
    // a tint this small is the difference between the palette theming the app and the palette
    // theming its buttons.
    "--color-white": toHex({
      mode: "oklch",
      l: 0.995,
      c: paleChroma * 0.6,
      h: hue,
    }),
  };

  for (const [step, lightness] of NEUTRAL_STEPS) {
    variables[`--color-zinc-${step}`] = toHex({
      mode: "oklch",
      l: lightness,
      c: lightness > PALE_THRESHOLD ? paleChroma : neutralChroma,
      h: hue,
    });
  }

  for (const [name, lightness] of SURFACE_STEPS) {
    variables[`--color-${name}`] = toHex({
      mode: "oklch",
      l: lightness,
      c: neutralChroma,
      h: hue,
    });
  }

  return { variables, primary };
}

/**
 * The theme's second colour, at a lightness that sits it above the accent.
 *
 * Only hue and chroma are taken from whatever supplied it, exactly as for the accent — a palette
 * column can be any lightness at all, and a second colour that changed lightness with the palette
 * would be unreadable as often as not.
 */
function secondary(
  supplied: string | null | undefined,
  baseHue: number,
  baseChroma: number,
): string {
  const source = supplied ? safeOklch(supplied) : null;
  const hasOwnHue = source && (source.c ?? 0) >= 0.002;
  const hue = hasOwnHue
    ? (source.h ?? 0)
    : (baseHue + SECONDARY_HUE_SHIFT) % 360;
  const chroma = hasOwnHue ? (source.c ?? 0) : baseChroma;
  return toHex({
    mode: "oklch",
    l: SECONDARY_LIGHTNESS,
    c: Math.min(SECONDARY_MAX_CHROMA, chroma * 0.6),
    h: hue,
  });
}

/**
 * Walks a tint of the accent up in lightness until it is visible against the accent itself.
 *
 * Only ever lighter, never a different hue, so there is no point at which it has to jump to the
 * other side to stay readable. Same hue also means contrast rises monotonically with lightness,
 * so the first value that clears the bar is the closest one to the accent — the mark stays a tint
 * of the theme rather than drifting off toward white.
 */
function lightenUntilVisible(
  primary: string,
  chroma: number,
  hue: number,
): string {
  const tint = Math.min(0.09, chroma * 0.35);
  for (
    let lightness = ON_PRIMARY_START_LIGHTNESS;
    lightness <= 0.99;
    lightness += 0.01
  ) {
    const hex = toHex({ mode: "oklch", l: lightness, c: tint, h: hue });
    if (contrastRatio(hex, primary) >= ON_PRIMARY_MIN_CONTRAST) return hex;
  }
  return toHex({ mode: "oklch", l: 0.99, c: tint, h: hue });
}

/**
 * Walks the accent down in lightness until white text on it clears AA.
 *
 * A yellow or a pale mint is a perfectly good palette and a terrible button, and the palette tool
 * exists partly to let people build exactly those. Refusing to theme would be the wrong answer —
 * so the hue is kept and the lightness is spent until the contrast is there.
 */
function darkenUntilReadable(base: {
  mode: "oklch";
  l: number;
  c: number;
  h: number;
}): string {
  let lightness = base.l;
  for (let attempt = 0; attempt < 24; attempt++) {
    const hex = toHex({ ...base, l: lightness });
    if (contrastRatio(hex, ON_PRIMARY) >= PRIMARY_MIN_CONTRAST) return hex;
    lightness -= 0.025;
    if (lightness <= 0.12) break;
  }
  return toHex({ ...base, l: 0.12 });
}
