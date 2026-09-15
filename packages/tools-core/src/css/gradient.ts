export type GradientType = "linear" | "radial" | "conic";

export interface GradientStop {
  color: string;
  /** Percentage along the gradient, 0–100. */
  position: number;
}

export interface Gradient {
  type: GradientType;
  /** Degrees. Meaningless for radial, which has no direction — kept on the shared shape anyway so
   *  switching type and back doesn't lose the angle you'd dialled in. */
  angle: number;
  stops: GradientStop[];
}

export const GRADIENT_TYPES: { id: GradientType; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "radial", label: "Radial" },
  { id: "conic", label: "Conic" },
];

function formatStops(stops: GradientStop[]): string {
  return (
    [...stops]
      // Sorted on output rather than on edit: dragging one stop past another shouldn't renumber the
      // list under your cursor, but CSS needs them in order or it clamps them into place.
      .sort((a, b) => a.position - b.position)
      .map(
        (stop) => `${stop.color.toLowerCase()} ${Math.round(stop.position)}%`,
      )
      .join(", ")
  );
}

/** The bare `*-gradient(...)` value, for assigning straight to background-image. */
export function formatGradient(gradient: Gradient): string {
  const stops = formatStops(gradient.stops);
  switch (gradient.type) {
    case "linear":
      return `linear-gradient(${Math.round(gradient.angle)}deg, ${stops})`;
    case "radial":
      return `radial-gradient(circle, ${stops})`;
    case "conic":
      return `conic-gradient(from ${Math.round(gradient.angle)}deg, ${stops})`;
  }
}

export function formatGradientCss(gradient: Gradient): string {
  return `background: ${formatGradient(gradient)};`;
}
