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

// Far enough round the wheel from the primary to read as a different colour rather than a
// variation of it. A colour duller than SECONDARY_MIN_CHROMA has no hue worth measuring — near
// greys report whatever hue fell out of the conversion — so it never counts as a second hue.
const SECONDARY_MIN_HUE_DISTANCE = 40;
const SECONDARY_MIN_CHROMA = 0.04;
// The secondary button's label is small text, so it answers to the body-copy threshold.
const SECONDARY_MIN_CONTRAST = 4.5;
// The band a palette entry has to sit in to be *seen* as its hue. A scale's darkest and lightest
// steps clear contrast easily, by being nearly black or nearly white — and then read as black or
// white, which is no second colour at all. Inside this band the hue is unmistakable. The floor
// sits low enough to keep a deep, saturated shade — a scale's 700 of purple is L 0.30 and plainly
// purple — while the 800s and 900s below it read as black.
const SECONDARY_MIN_LIGHTNESS = 0.25;
const SECONDARY_MAX_LIGHTNESS = 0.85;
// How far in lightness a shade of the primary's own hue has to sit from it to read as a different
// shade rather than a near-twin of the primary button beside it.
const SECONDARY_MIN_SHADE_GAP = 0.12;

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
 * The palette's second accent, as it appears in one mode — always one of the palette's own colours.
 *
 * It used to invent one when the palette had no second hue, by rotating the primary round the
 * wheel, which put a yellow secondary on a monochrome purple palette: a colour nobody picked,
 * presented as part of their theme. A theme is a reading of a palette, not an addition to it.
 *
 * So it ranks what the palette has: a different hue first, since that is what a second accent is
 * for; then an entry that is visibly a colour rather than near-black or near-white; then, for a
 * shade of the primary's own hue, one far enough from it in lightness to read as a different
 * shade; then the most colourful. It once ranked same-hue shades by how far they sat from the
 * primary, which walks straight to the extremes — a monochrome purple's secondary came out as its
 * 900, which is black to look at.
 *
 * The first entry in that order that both reads on this mode's surface and is visibly its colour
 * is used as it is. Otherwise the best of them is walked in lightness until it reads — its hue and
 * chroma are still the palette's, only its lightness moves — because a shade you can see is purple
 * beats a palette entry that is technically purple and looks black. A palette with nothing but the
 * primary in it gets a shade of the primary, there being nothing else in it to use.
 */
function secondaryFor(
  colors: string[],
  accent: string,
  surface: string,
  mode: "light" | "dark",
): string {
  const accentHue = hueOf(accent);
  const accentLightness = lightnessOf(accent);
  const others = colors
    .filter((hex) => hex.toLowerCase() !== accent.toLowerCase())
    .map((hex) => {
      const chroma = chromaOf(hex);
      const distance =
        chroma >= SECONDARY_MIN_CHROMA ? hueDistance(hueOf(hex), accentHue) : 0;
      const lightness = lightnessOf(hex);
      const isOtherHue = distance >= SECONDARY_MIN_HUE_DISTANCE;
      return {
        hex,
        chroma,
        lightness,
        isOtherHue,
        isDistinct:
          isOtherHue ||
          Math.abs(lightness - accentLightness) >= SECONDARY_MIN_SHADE_GAP,
        isVisible:
          lightness >= SECONDARY_MIN_LIGHTNESS &&
          lightness <= SECONDARY_MAX_LIGHTNESS,
        ratio: contrastRatio(hex, surface),
      };
    });

  if (others.length === 0) {
    return walkToContrast(accentHue, chromaOf(accent), surface, mode);
  }

  type Candidate = (typeof others)[number];
  const better = (a: Candidate, b: Candidate): number =>
    Number(b.isOtherHue) - Number(a.isOtherHue) ||
    Number(b.isVisible) - Number(a.isVisible) ||
    Number(b.isDistinct) - Number(a.isDistinct) ||
    b.chroma - a.chroma;
  const ranked = [...others].sort(better);

  const ready = ranked.find(
    (entry) => entry.isVisible && entry.ratio >= SECONDARY_MIN_CONTRAST,
  );
  if (ready) return ready.hex;

  const best = ranked[0] as Candidate;
  return walkToContrast(hueOf(best.hex), best.chroma, surface, mode);
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
