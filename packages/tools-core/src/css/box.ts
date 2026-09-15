import { formatRadius, type RadiusCorners, type RadiusUnit } from "./radius";
import { formatBoxShadow, formatShadowLayer, type ShadowLayer } from "./shadow";

/** Everything the box editor can set on a single element. Radius and shadow live on the same
 *  shape in practice, so they're emitted as one rule rather than two you'd merge by hand. */
export interface BoxStyle {
  width: number;
  height: number;
  corners: RadiusCorners;
  radiusUnit: RadiusUnit;
  layers: ShadowLayer[];
  foreground: string;
  backdrop: string;
}

// Shared between the markup and the stylesheet so the two halves always agree — a class renamed
// in one and not the other silently produces an unstyled box.
const STAGE_CLASS = "box-stage";
const BOX_CLASS = "box";

/** The markup half. Static because nothing about the styling changes the structure. */
export function formatBoxMarkup(): string {
  return [
    `<div class="${STAGE_CLASS}">`,
    `  <div class="${BOX_CLASS}"></div>`,
    "</div>",
  ].join("\n");
}

/**
 * The stylesheet half: real rules against real class names, so it drops straight into a stylesheet
 * (or a playground's CSS pane) beside the markup from formatBoxMarkup.
 *
 * Carries the box's size and background as well as the radius and shadow, because a shadow needs
 * something to hang off — an element with no dimensions and no fill renders nothing at all, and a
 * radius is invisible without a background to cut the corner out of.
 */
export function formatBoxStylesheet(style: BoxStyle): string {
  const lines = [
    `.${STAGE_CLASS} {`,
    `  background: ${style.backdrop.toLowerCase()};`,
    "  display: grid;",
    "  place-items: center;",
    "  min-height: 100vh;",
    "  padding: 48px;",
    "}",
    "",
    `.${BOX_CLASS} {`,
    `  width: ${style.width}px;`,
    `  height: ${style.height}px;`,
    `  background: ${style.foreground.toLowerCase()};`,
    `  border-radius: ${formatRadius(style.corners, style.radiusUnit)};`,
  ];

  if (style.layers.length === 1) {
    lines.push(
      `  box-shadow: ${formatShadowLayer(style.layers[0] as ShadowLayer)};`,
    );
  } else if (style.layers.length > 1) {
    // Wrapped across lines because a multi-layer shadow on one line is unreadable, and that's
    // exactly the case where you most want to read it.
    lines.push("  box-shadow:");
    lines.push(
      style.layers
        .map((layer) => `    ${formatShadowLayer(layer)}`)
        .join(",\n")
        .concat(";"),
    );
  }

  lines.push("}");
  return lines.join("\n");
}

/** The shadow value on its own, for assigning to a live preview's style. */
export function formatBoxShadowValue(layers: ShadowLayer[]): string {
  return formatBoxShadow(layers);
}
