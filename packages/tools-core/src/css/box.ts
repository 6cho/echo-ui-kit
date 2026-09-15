import { type Fill, formatFill } from "./fill";
import { formatRadius, type RadiusCorners, type RadiusUnit } from "./radius";
import { formatShadowLayer, type ShadowLayer } from "./shadow";

/**
 * Everything the box editor can set on a single element. Every property except the stage backdrop
 * is optional, because not every element needs all of them — a component that already gets its
 * size from a layout shouldn't have width and height forced into the rule you paste.
 *
 * Grouped by what's switched on and off together: width and height go as a pair, and the radius
 * unit is meaningless without corners to apply it to.
 */
export interface BoxStyle {
  size?: { width: number; height: number };
  radius?: { corners: RadiusCorners; unit: RadiusUnit };
  layers?: ShadowLayer[];
  foreground?: Fill;
  /** The stage behind the element. Not a property of the element itself — it's the surface being
   *  designed against — so it's always present. */
  backdrop: Fill;
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
 * Only emits what's actually switched on. A rule listing properties you didn't want is worse than
 * one that's short — you'd have to delete them by hand at the other end, and every one you missed
 * would override whatever the real element already had.
 */
export function formatBoxStylesheet(style: BoxStyle): string {
  const lines = [
    `.${STAGE_CLASS} {`,
    `  background: ${formatFill(style.backdrop)};`,
    "  display: grid;",
    "  place-items: center;",
    "  min-height: 100vh;",
    "  padding: 48px;",
    "}",
    "",
    `.${BOX_CLASS} {`,
  ];

  if (style.size) {
    lines.push(`  width: ${style.size.width}px;`);
    lines.push(`  height: ${style.size.height}px;`);
  }
  if (style.foreground) {
    lines.push(`  background: ${formatFill(style.foreground)};`);
  }
  if (style.radius) {
    lines.push(
      `  border-radius: ${formatRadius(style.radius.corners, style.radius.unit)};`,
    );
  }

  const layers = style.layers ?? [];
  if (layers.length === 1) {
    lines.push(`  box-shadow: ${formatShadowLayer(layers[0] as ShadowLayer)};`);
  } else if (layers.length > 1) {
    // Wrapped across lines because a multi-layer shadow on one line is unreadable, and that's
    // exactly the case where you most want to read it.
    lines.push("  box-shadow:");
    lines.push(
      layers
        .map((layer) => `    ${formatShadowLayer(layer)}`)
        .join(",\n")
        .concat(";"),
    );
  }

  lines.push("}");
  return lines.join("\n");
}
