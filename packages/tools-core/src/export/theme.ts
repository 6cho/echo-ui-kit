import { contrastRatio } from "../color/contrast";
import { toHex, toOklch } from "../color/convert";
import { NEUTRAL_SCALE } from "../color/neutral";

export type ThemeRoleId =
  | "background"
  | "surface"
  | "border"
  | "text"
  | "muted"
  | "primary"
  | "onPrimary"
  | "secondary";

export interface ThemeRole {
  id: ThemeRoleId;
  label: string;
  /** What it's for, shown next to the slot — the names alone don't say which is the page and
   *  which is the card sitting on it. */
  hint: string;
  /** The role whose contrast this one has to clear, when it carries text. */
  against?: ThemeRoleId;
}

// Deliberately small. These eight cover a real interface — page, card, divider, body copy,
// secondary copy, the accent, what sits on the accent, and a second accent — and every one you
// add is another decision to make twice, once per mode.
export const THEME_ROLES: ThemeRole[] = [
  { id: "background", label: "Background", hint: "The page itself" },
  { id: "surface", label: "Surface", hint: "Cards and panels on it" },
  { id: "border", label: "Border", hint: "Dividers and outlines" },
  { id: "text", label: "Text", hint: "Body copy", against: "surface" },
  {
    id: "muted",
    label: "Muted text",
    hint: "Secondary copy",
    against: "surface",
  },
  { id: "primary", label: "Primary", hint: "Buttons and accents" },
  {
    id: "onPrimary",
    label: "On primary",
    hint: "Text on the accent",
    against: "primary",
  },
  // The second of the palette's colours to reach the interface. Without it a theme built from a
  // three-hue palette shows one hue and its tints — the palette might as well have been one
  // colour. Checked against the surface because it carries the secondary button's label.
  {
    id: "secondary",
    label: "Secondary",
    hint: "A second accent",
    against: "surface",
  },
];

export type ThemeMapping = Record<ThemeRoleId, string>;

/**
 * The colour a palette is most "about" — its most saturated entry.
 *
 * Exported because more than one thing has to agree on it. The theme's accent is this colour, and
 * the neutrals are tinted toward it, so if they were each worked out separately the structure
 * could end up leaning toward one colour while the buttons were another.
 */
export function paletteAccent(colors: string[]): string | null {
  if (colors.length === 0) return null;
  return [...colors].sort((a, b) => chromaOf(b) - chromaOf(a))[0] as string;
}

// Muted text still has to be read, so it can't go below the large-text floor; aiming at the
// normal-text threshold keeps it comfortably legible while leaving headroom beneath body copy.
const MUTED_TARGET_CONTRAST = 4.5;
// Text on the accent has the same job as body copy, so it answers to the same threshold.
const ON_ACCENT_MIN_CONTRAST = 4.5;

// What makes a palette colour a candidate for the second accent: far enough round the wheel from
// the first to read as a different colour rather than a variation of it, and colourful enough to
// be an accent at all — the palette's near-whites and near-blacks are neither.
const SECONDARY_MIN_HUE_DISTANCE = 40;
const SECONDARY_MIN_CHROMA = 0.04;
// When a palette has no second hue (monochrome, or a single colour), the companion is made by
// rotating the accent this far: plainly a different colour, short of the direct complement,
// which reads as a clash rather than a partner.
const SECONDARY_FALLBACK_SHIFT = 150;
// The secondary button's label is small text, so it answers to the body-copy threshold.
const SECONDARY_MIN_CONTRAST = 4.5;
// The band a palette entry has to sit in to be *seen* as its hue. A scale's darkest and lightest
// steps clear contrast easily, by being nearly black or nearly white — and then read as black or
// white, which is no second colour at all. Inside this band the hue is unmistakable.
const SECONDARY_MIN_LIGHTNESS = 0.32;
const SECONDARY_MAX_LIGHTNESS = 0.85;
const SECONDARY_VIVID_CHROMA = 0.08;
// The most colour a derived secondary is given, so a derived one never outshouts the palette's own.
const SECONDARY_MAX_CHROMA = 0.18;
// Below this a palette has no colour to speak of — black, white and greys — and its secondary is a
// grey too. Matches the point at which the palette tool itself warns that a base colour has
// little to no colour. This works on colours rather than on a slider, so it is a chroma figure;
// the palette tool locks anything under 5% saturation to exact grey before it ever gets here,
// so a palette built there arrives either plainly coloured or with no chroma at all.
const ACHROMATIC_CHROMA = 0.02;

export interface ThemePair {
  light: ThemeMapping;
  dark: ThemeMapping;
}

function lightnessOf(hex: string): number {
  try {
    return toOklch(hex).l;
  } catch {
    return 0.5;
  }
}

function hueOf(hex: string): number {
  try {
    return toOklch(hex).h ?? 0;
  } catch {
    return 0;
  }
}

/** Distance between two hues the short way round the wheel. */
function hueDistance(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/**
 * The palette's second accent, as it appears in one mode.
 *
 * Taken from the palette where it can be: the most colourful entry whose hue is well away from the
 * accent's and which already reads on this mode's surface. A palette of scales usually has one —
 * a light step of the second hue for dark mode, a dark step for light — and using it as-is means
 * the theme is showing a colour you actually picked, not one derived beside it.
 *
 * Failing that the hue still comes from the palette, the entry furthest round the wheel from the
 * accent, walked in lightness until it reads. Only a palette with no second hue at all falls back
 * to a rotation of the accent.
 */
function secondaryFor(
  colors: string[],
  accent: string,
  surface: string,
  mode: "light" | "dark",
): string {
  const accentHue = hueOf(accent);
  const candidates = colors
    .filter((hex) => chromaOf(hex) >= SECONDARY_MIN_CHROMA)
    .map((hex) => ({
      hex,
      chroma: chromaOf(hex),
      lightness: lightnessOf(hex),
      distance: hueDistance(hueOf(hex), accentHue),
      ratio: contrastRatio(hex, surface),
    }))
    .filter((entry) => entry.distance >= SECONDARY_MIN_HUE_DISTANCE);

  // Used as-is only if it reads on the surface *and* still looks like its colour while doing it.
  const ready = candidates
    .filter(
      (entry) =>
        entry.ratio >= SECONDARY_MIN_CONTRAST &&
        entry.chroma >= SECONDARY_VIVID_CHROMA &&
        entry.lightness >= SECONDARY_MIN_LIGHTNESS &&
        entry.lightness <= SECONDARY_MAX_LIGHTNESS,
    )
    .sort((a, b) => b.chroma - a.chroma)[0];
  if (ready) return ready.hex;

  const furthest = [...candidates].sort(
    (a, b) => b.distance - a.distance || b.chroma - a.chroma,
  )[0];
  if (furthest) {
    return walkToContrast(
      hueOf(furthest.hex),
      Math.min(SECONDARY_MAX_CHROMA, furthest.chroma),
      surface,
      mode,
    );
  }

  // No second hue anywhere in the palette. How colourful the companion is comes from the palette
  // as a whole rather than from a floor picked here: a muted palette gets a muted partner, and a
  // palette of black and white gets a grey. Rotating the hue of something with no hue and then
  // forcing it to be saturated is how a black-and-white palette used to come out with a green.
  const paletteChroma = Math.max(0, ...colors.map(chromaOf));
  if (paletteChroma < ACHROMATIC_CHROMA) {
    return walkToContrast(0, 0, surface, mode);
  }
  return walkToContrast(
    (accentHue + SECONDARY_FALLBACK_SHIFT) % 360,
    Math.min(SECONDARY_MAX_CHROMA, paletteChroma),
    surface,
    mode,
  );
}

/**
 * A colour at a given hue, walked away from the surface in lightness until it reads on it —
 * darker on a pale card, lighter on a dark one. Hue and chroma are held, so it stays the colour
 * it was chosen to be.
 */
function walkToContrast(
  hue: number,
  chroma: number,
  surface: string,
  mode: "light" | "dark",
): string {
  const step = mode === "light" ? -0.02 : 0.02;
  for (
    let lightness = mode === "light" ? 0.58 : 0.7;
    lightness > 0.15 && lightness < 0.97;
    lightness += step
  ) {
    const hex = toHex({ mode: "oklch", l: lightness, c: chroma, h: hue });
    if (contrastRatio(hex, surface) >= SECONDARY_MIN_CONTRAST) return hex;
  }
  return toHex({
    mode: "oklch",
    l: mode === "light" ? 0.3 : 0.9,
    c: chroma,
    h: hue,
  });
}

function chromaOf(hex: string): number {
  try {
    return toOklch(hex).c;
  } catch {
    return 0;
  }
}

/** Which rung of the neutral ramp each structural role sits on, per mode.
 *
 *  A real interface is mostly neutral and only occasionally accented, so these are what decide
 *  whether a theme looks like a theme. The pairs are chosen for the gap between them rather than
 *  for the values: a card one rung off its page reads as raised in both directions, a border two
 *  rungs off the card is visible without drawing itself, and body copy at the far end of the ramp
 *  from the surface is readable by construction rather than by luck.
 */
const NEUTRAL_ROLES: Record<
  "light" | "dark",
  Record<"background" | "surface" | "border" | "text" | "muted", number>
> = {
  light: { background: 100, surface: 50, border: 200, text: 900, muted: 500 },
  dark: { background: 900, surface: 800, border: 700, text: 50, muted: 400 },
};

/**
 * Proposes a light and a dark theme from a palette and the neutrals derived from it.
 *
 * A starting point rather than an answer — the point of the tool is to adjust it. But a blank set
 * of slots is useless, and most of the assignment is not a judgement call at all: page, card,
 * divider, body copy and secondary copy are structure, and structure wants neutrals. Only the
 * accent and what sits on it come from the palette.
 *
 * Handing those five roles to palette colours instead, which is what this did at first, produces
 * a theme that is technically built from your colours and looks nothing like software: a brown
 * card on a navy page with pink secondary text, every one of them a perfectly good colour doing a
 * job it was never meant to do.
 */
export function suggestThemePair(
  palette: string[],
  neutrals: string[],
  preferredAccent?: string | null,
): ThemePair {
  const colors = palette.length > 0 ? palette : ["#ffffff", "#18181b"];
  const ramp = neutrals.length > 0 ? neutrals : ["#ffffff", "#18181b"];

  /** The ramp entry for a step, by position, falling back to whichever end is nearest. */
  const atStep = (step: number): string => {
    const index = NEUTRAL_SCALE.findIndex((entry) => entry.step === step);
    const clamped = Math.min(ramp.length - 1, Math.max(0, index));
    return ramp[clamped] as string;
  };

  // The base colour when the caller has one. Picking the most saturated entry instead sounds
  // reasonable and is wrong: a triadic harmony off a red base contains a blue with more chroma than
  // the red, and the theme's primary came out blue while everything that drove it said red.
  const accent =
    preferredAccent ?? paletteAccent(colors) ?? (colors[0] as string);

  const forMode = (mode: "light" | "dark"): ThemeMapping => {
    const steps = NEUTRAL_ROLES[mode];
    const surface = atStep(steps.surface);
    // What goes on the accent. The ramp's own ends first, so the theme stays made of its own
    // colours — but at a high tint those ends are a saturated near-white and near-black rather
    // than white and black, and against some accents neither clears AA. Text on a button is the
    // one place to stop being principled about it.
    const onAccent =
      [atStep(50), atStep(900), "#ffffff", "#000000"]
        .map((hex) => ({ hex, ratio: contrastRatio(hex, accent) }))
        .find((entry) => entry.ratio >= ON_ACCENT_MIN_CONTRAST)?.hex ??
      ([atStep(50), atStep(900), "#ffffff", "#000000"]
        .map((hex) => ({ hex, ratio: contrastRatio(hex, accent) }))
        .sort((a, b) => b.ratio - a.ratio)[0]?.hex as string);

    return {
      background: atStep(steps.background),
      surface,
      border: atStep(steps.border),
      text: atStep(steps.text),
      // Off the ramp like the rest of the structure. Letting a palette colour win here was the
      // last place the old behaviour showed through: searching the palette for something at a
      // readable contrast found, on a blue theme, a green — and secondary copy is body copy that
      // recedes, not an accent.
      //
      // Stepping further from the surface when the nominal rung doesn't clear AA is what lets the
      // tint be turned all the way up: chroma leaves OKLCH lightness alone but does move sRGB
      // luminance, enough that a fully tinted ramp lands the usual rung at about 4.44.
      muted: mutedFor(atStep, mode, surface),
      primary: accent,
      onPrimary: onAccent,
      secondary: secondaryFor(colors, accent, surface, mode),
    };
  };

  return { light: forMode("light"), dark: forMode("dark") };
}

/**
 * Secondary copy: the rung that recedes from body copy while still clearing AA against the
 * surface it sits on, searching away from that surface until one does.
 */
function mutedFor(
  atStep: (step: number) => string,
  mode: "light" | "dark",
  surface: string,
): string {
  // Away from the surface in both cases: darker on a pale card, lighter on a dark one.
  const candidates = mode === "light" ? [500, 600, 700] : [400, 300, 200];
  for (const step of candidates) {
    const hex = atStep(step);
    if (contrastRatio(hex, surface) >= MUTED_TARGET_CONTRAST) return hex;
  }
  return atStep(mode === "light" ? 900 : 50);
}

/**
 * Emits both modes as custom properties — the light set on :root, the dark set under a `.dark`
 * class.
 *
 * Class-based rather than a prefers-color-scheme media query because a theme you can't override
 * from inside the app can't have a switch, and every app that ships dark mode eventually wants
 * one. A media query is one line to add on top of this; the reverse isn't true.
 */
export function formatThemeCss(pair: ThemePair): string {
  const declarations = (mapping: ThemeMapping) =>
    THEME_ROLES.map(
      (role) =>
        `  --color-${kebab(role.id)}: ${mapping[role.id].toLowerCase()};`,
    );

  return [
    ":root {",
    ...declarations(pair.light),
    "}",
    "",
    ".dark {",
    ...declarations(pair.dark),
    "}",
  ].join("\n");
}

function kebab(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
