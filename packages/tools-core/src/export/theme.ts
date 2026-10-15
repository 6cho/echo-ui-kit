import { contrastRatio } from "../color/contrast";
import { toOklch } from "../color/convert";
import { NEUTRAL_SCALE } from "../color/neutral";

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

export interface ThemePair {
  light: ThemeMapping;
  dark: ThemeMapping;
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
): ThemePair {
  const colors = palette.length > 0 ? palette : ["#ffffff", "#18181b"];
  const ramp = neutrals.length > 0 ? neutrals : ["#ffffff", "#18181b"];

  /** The ramp entry for a step, by position, falling back to whichever end is nearest. */
  const atStep = (step: number): string => {
    const index = NEUTRAL_SCALE.findIndex((entry) => entry.step === step);
    const clamped = Math.min(ramp.length - 1, Math.max(0, index));
    return ramp[clamped] as string;
  };

  const accent = paletteAccent(colors) ?? (colors[0] as string);

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
