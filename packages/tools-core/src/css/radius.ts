export type RadiusUnit = "px" | "%";

export interface RadiusCorners {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export const RADIUS_CORNER_KEYS = [
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
] as const satisfies readonly (keyof RadiusCorners)[];

export const RADIUS_CORNER_LABELS: Record<keyof RadiusCorners, string> = {
  topLeft: "Top left",
  topRight: "Top right",
  bottomRight: "Bottom right",
  bottomLeft: "Bottom left",
};

/**
 * Collapses to the shortest form CSS accepts: one value when every corner matches, otherwise the
 * full four. Shorthand order is clockwise from the top-left, which is also the order
 * RADIUS_CORNER_KEYS is declared in so the controls and the output can't disagree.
 */
export function formatRadius(
  corners: RadiusCorners,
  unit: RadiusUnit = "px",
): string {
  const values = RADIUS_CORNER_KEYS.map((key) => corners[key]);
  const allEqual = values.every((value) => value === values[0]);
  if (allEqual) return `${values[0]}${unit}`;
  return values.map((value) => `${value}${unit}`).join(" ");
}

export function formatRadiusCss(
  corners: RadiusCorners,
  unit: RadiusUnit = "px",
): string {
  return `border-radius: ${formatRadius(corners, unit)};`;
}
