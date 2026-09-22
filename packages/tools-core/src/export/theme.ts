import { contrastRatio } from "../color/contrast";
import { toOklch } from "../color/convert";

export type ThemeRoleId =
  | "background"
  | "surface"
  | "border"
  | "text"
  | "muted"
  | "primary"
  | "onPrimary";

export interface ThemeRole {
  id: ThemeRoleId;
  label: string;
  /** What it's for, shown next to the slot — the names alone don't say which is the page and
   *  which is the card sitting on it. */
  hint: string;
  /** The role whose contrast this one has to clear, when it carries text. */
  against?: ThemeRoleId;
}

// Deliberately small. These seven cover a real interface — page, card, divider, body copy,
// secondary copy, the accent, and what sits on the accent — and every one you add is another
// decision to make twice, once per mode.
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
];

export type ThemeMapping = Record<ThemeRoleId, string>;

// Muted text still has to be read, so it can't go below the large-text floor; aiming at the
// normal-text threshold keeps it comfortably legible while leaving headroom beneath body copy.
const MUTED_MIN_CONTRAST = 3;
const MUTED_TARGET_CONTRAST = 4.5;

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

function chromaOf(hex: string): number {
  try {
    return toOklch(hex).c;
  } catch {
    return 0;
  }
}

/**
 * Proposes a light and a dark theme from a palette.
 *
 * A starting point rather than an answer — the point of the tool is to adjust it. But a blank set
 * of slots is useless, and the obvious assignment is mechanical: the extremes of the palette
 * become page and text, the most saturated color becomes the accent, and the whole thing inverts
 * for dark mode.
 *
 * Picking by lightness and chroma rather than by position, because a palette arriving from an
 * image or a page scan has no meaningful order to rely on.
 */
export function suggestThemePair(palette: string[]): ThemePair {
  const colors = palette.length > 0 ? palette : ["#ffffff", "#18181b"];
  const byLightness = [...colors].sort(
    (a, b) => lightnessOf(a) - lightnessOf(b),
  );
  const darkest = byLightness[0] as string;
  const lightest = byLightness[byLightness.length - 1] as string;
  const mid =
    byLightness[Math.floor(byLightness.length / 2)] ?? (darkest as string);

  // The most colorful entry, which is almost always what a palette is actually "about" — the
  // neutrals around it are scaffolding.
  const accent = [...colors].sort(
    (a, b) => chromaOf(b) - chromaOf(a),
  )[0] as string;

  // Whichever extreme reads better against the accent, rather than assuming white.
  const onAccent =
    contrastRatio(lightest, accent) >= contrastRatio(darkest, accent)
      ? lightest
      : darkest;

  // A surface has to be distinguishable from the page behind it, so the next step along the
  // lightness ramp gives a card that reads as raised. But on a two-color palette that next step
  // *is* the light extreme — which dark mode is already using for text, so the card would be
  // white text on white. Better a flat surface than an invisible one.
  const nextDarkest = byLightness.find((hex) => hex !== darkest);
  const darkSurface =
    nextDarkest && nextDarkest !== lightest ? nextDarkest : darkest;

  const light: ThemeMapping = {
    background: lightest,
    surface: "#ffffff",
    border: mid,
    text: darkest,
    muted: pickMuted(colors, "#ffffff", darkest),
    primary: accent,
    onPrimary: onAccent,
  };
  const dark: ThemeMapping = {
    background: darkest,
    surface: darkSurface,
    border: mid,
    text: lightest,
    muted: pickMuted(colors, darkSurface, lightest),
    primary: accent,
    onPrimary: onAccent,
  };
  return { light, dark };
}

/**
 * Secondary text: readable against its surface, but visibly softer than body copy.
 *
 * Aims at the AA threshold rather than maximising contrast, because the point of muted text is to
 * recede — the highest-contrast option is already what `text` uses. Anything failing outright is
 * excluded first, and if nothing in the palette clears the bar it falls back to the body color,
 * since dropping to something unreadable would be worse than losing the distinction.
 *
 * Exists because the naive choice — the palette's middle color — can land on the surface color
 * itself and produce 1:1, invisible text. That isn't hypothetical: it's what the first version of
 * this function did on a five-color blue ramp.
 */
function pickMuted(
  candidates: string[],
  surface: string,
  fallback: string,
): string {
  const readable = candidates
    .filter((hex) => hex.toLowerCase() !== surface.toLowerCase())
    .map((hex) => ({ hex, ratio: contrastRatio(hex, surface) }))
    .filter((entry) => entry.ratio >= MUTED_MIN_CONTRAST);
  if (readable.length === 0) return fallback;
  readable.sort(
    (a, b) =>
      Math.abs(a.ratio - MUTED_TARGET_CONTRAST) -
      Math.abs(b.ratio - MUTED_TARGET_CONTRAST),
  );
  return (readable[0] as { hex: string }).hex;
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
