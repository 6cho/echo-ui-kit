import { toRgb255 } from "../color/contrast";

export interface ShadowLayer {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  /** Opaque hex; the alpha is carried separately in `opacity` so a color picker can hand over a
   *  plain palette color without having to bake transparency into it first. */
  color: string;
  /** 0–1. */
  opacity: number;
  inset: boolean;
}

export interface ShadowPreset {
  id: string;
  label: string;
  layers: ShadowLayer[];
}

function layer(
  offsetY: number,
  blur: number,
  spread: number,
  opacity: number,
  inset = false,
): ShadowLayer {
  return {
    offsetX: 0,
    offsetY,
    blur,
    spread,
    color: "#000000",
    opacity,
    inset,
  };
}

// Deliberately *not* Tailwind's scale, which these were originally copied from. Tailwind's steps
// sit close together (blur 3 → 6 → 15 → 25) because they're meant to be picked from a menu with
// the class name telling you which you got. Here you're choosing by eye from a preview, so
// neighbouring presets that look nearly identical are useless — these roughly double each step
// (blur 2 → 12 → 32 → 64) so every one is visibly a different depth.
//
// The multi-layer entries stack a tight contact shadow under a wider ambient one, which is what
// separates a shadow that reads as depth from one that reads as a gray smear.
export const OUTER_SHADOW_PRESETS: ShadowPreset[] = [
  { id: "small", label: "Small", layers: [layer(1, 2, 0, 0.06)] },
  {
    id: "medium",
    label: "Medium",
    layers: [layer(6, 12, -2, 0.12), layer(2, 4, -2, 0.08)],
  },
  {
    id: "large",
    label: "Large",
    layers: [layer(18, 32, -6, 0.16), layer(6, 12, -6, 0.1)],
  },
  { id: "dramatic", label: "Dramatic", layers: [layer(32, 64, -12, 0.28)] },
  {
    id: "soft",
    label: "Soft",
    layers: [
      layer(1, 2, 0, 0.04),
      layer(4, 8, -1, 0.06),
      layer(12, 24, -4, 0.08),
    ],
  },
];

// Shares the outer set's ids on purpose: the two lists are parallel, so a direction and a style
// id together name exactly one preset, and switching direction keeps whatever style was chosen.
//
// Deliberately mirrors the outer scale step for step — same blur ramp (2 → 12 → 32 → 64), so
// "Large" means the same magnitude whichever group you picked it from, and switching between the
// two is a change of direction rather than also an unannounced change of size.
//
// The numbers aren't identical though: an inset shadow is confined inside the element, so it
// covers a far larger share of what you see than the same value cast outward does. These carry
// more opacity to stay visible against the element's own fill, and less vertical offset — a 32px
// offset that merely shifts an outer shadow would push an inset one clean off the opposite edge.
export const INNER_SHADOW_PRESETS: ShadowPreset[] = [
  { id: "small", label: "Small", layers: [layer(1, 2, 0, 0.08, true)] },
  {
    id: "medium",
    label: "Medium",
    layers: [layer(4, 12, -2, 0.15, true), layer(1, 3, 0, 0.08, true)],
  },
  {
    id: "large",
    label: "Large",
    layers: [layer(8, 32, -6, 0.22, true), layer(2, 8, -2, 0.12, true)],
  },
  {
    id: "dramatic",
    label: "Dramatic",
    layers: [layer(12, 64, -12, 0.38, true)],
  },
  {
    id: "soft",
    label: "Soft",
    layers: [
      layer(1, 2, 0, 0.05, true),
      layer(3, 8, -1, 0.08, true),
      layer(8, 24, -4, 0.1, true),
    ],
  },
];

function formatColor(hex: string, opacity: number): string {
  let r: number;
  let g: number;
  let b: number;
  try {
    ({ r, g, b } = toRgb255(hex));
  } catch {
    return hex;
  }
  // rgba() rather than an 8-digit hex: both are equally supported now, but the decimal alpha is
  // the part someone actually hand-tunes after pasting this, and `0.15` is far easier to read and
  // edit than `26`.
  return `rgba(${r}, ${g}, ${b}, ${Number(opacity.toFixed(3))})`;
}

export function formatShadowLayer(layer: ShadowLayer): string {
  const parts = [
    `${layer.offsetX}px`,
    `${layer.offsetY}px`,
    `${layer.blur}px`,
    `${layer.spread}px`,
    formatColor(layer.color, layer.opacity),
  ];
  if (layer.inset) parts.unshift("inset");
  return parts.join(" ");
}

/** Joins layers into one box-shadow value. Order matters and is preserved: the first layer paints
 *  on top, which is why a "smooth" shadow stacks a tight dark layer over progressively wider,
 *  fainter ones. */
export function formatBoxShadow(layers: ShadowLayer[]): string {
  if (layers.length === 0) return "none";
  return layers.map(formatShadowLayer).join(", ");
}

// Shared between the markup and the stylesheet so the two halves always agree — a class renamed
// in one and not the other silently produces an unstyled box.
const STAGE_CLASS = "shadow-stage";
const CARD_CLASS = "shadow-card";

// Matches the on-screen preview card, so what you paste elsewhere looks like what you tuned.
const DEMO_CARD_WIDTH = 112;
const DEMO_CARD_HEIGHT = 80;
const DEMO_CARD_RADIUS = 12;

/** The markup half: a card on a stage, classed to match formatShadowStylesheet. Static because
 *  nothing about the shadow changes the structure — only the stylesheet does. */
export function formatShadowMarkup(): string {
  return [
    `<div class="${STAGE_CLASS}">`,
    `  <div class="${CARD_CLASS}"></div>`,
    "</div>",
  ].join("\n");
}

/**
 * The stylesheet half: real rules against real class names, so it drops straight into a stylesheet
 * (or CodePen's CSS pane) beside the markup from formatShadowMarkup.
 *
 * It carries the card's dimensions and both surface colors rather than the shadow alone, because
 * a shadow needs something to hang off — an element with no size and no background renders
 * nothing at all, and a shadow judged against one backdrop can disappear entirely against
 * another. The declaration wraps across lines when there's more than one layer, which is exactly
 * when you most need to read it.
 */
export function formatShadowStylesheet(
  layers: ShadowLayer[],
  foreground: string,
  backdrop: string,
): string {
  // The leading space belongs to the single-layer form only — the stacked form starts on the next
  // line, and gluing a space in front of a newline just leaves trailing whitespace.
  const shadow =
    layers.length <= 1
      ? ` ${formatBoxShadow(layers)}`
      : `\n${layers.map((layer) => `    ${formatShadowLayer(layer)}`).join(",\n")}`;
  return [
    `.${STAGE_CLASS} {`,
    `  background: ${backdrop};`,
    "  display: grid;",
    "  place-items: center;",
    "  min-height: 100vh;",
    "  padding: 48px;",
    "}",
    "",
    `.${CARD_CLASS} {`,
    `  width: ${DEMO_CARD_WIDTH}px;`,
    `  height: ${DEMO_CARD_HEIGHT}px;`,
    `  border-radius: ${DEMO_CARD_RADIUS}px;`,
    `  background: ${foreground};`,
    `  box-shadow:${shadow};`,
    "}",
  ].join("\n");
}
