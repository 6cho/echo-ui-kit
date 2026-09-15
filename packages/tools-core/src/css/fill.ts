import { formatGradient, type Gradient } from "./gradient";

/**
 * What paints a surface. A solid color and a gradient both answer "what's behind this", and CSS
 * takes either in the same `background` slot — so the two are modelled as one value rather than
 * as a color with a gradient bolted on beside it.
 */
export type Fill =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; gradient: Gradient };

export function solidFill(color: string): Fill {
  return { kind: "solid", color };
}

export function formatFill(fill: Fill): string {
  return fill.kind === "solid"
    ? fill.color.toLowerCase()
    : formatGradient(fill.gradient);
}

/** A short label for a collapsed section header — enough to tell what a surface is set to
 *  without opening it. */
export function describeFill(fill: Fill): string {
  if (fill.kind === "solid") return fill.color.toLowerCase();
  const count = fill.gradient.stops.length;
  return `${fill.gradient.type}, ${count} stop${count === 1 ? "" : "s"}`;
}

/** The color a fill reads as when something needs one value — the first stop of a gradient.
 *  Used for the swatch previews, which can't show a gradient in a 14px dot legibly. */
export function fillPreviewColor(fill: Fill): string {
  if (fill.kind === "solid") return fill.color;
  const sorted = [...fill.gradient.stops].sort(
    (a, b) => a.position - b.position,
  );
  return sorted[0]?.color ?? "#000000";
}
