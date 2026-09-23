export interface CubicBezier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface EasingPreset {
  id: string;
  label: string;
  value: CubicBezier;
}

// The CSS keywords plus the Material-style set most design systems land on. Worth having as a
// starting point rather than a closed list: the whole reason to edit a curve by hand is that the
// keywords are a coarse approximation of what you actually want.
export const EASING_PRESETS: EasingPreset[] = [
  { id: "linear", label: "Linear", value: { x1: 0, y1: 0, x2: 1, y2: 1 } },
  { id: "ease", label: "Ease", value: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } },
  { id: "ease-in", label: "Ease In", value: { x1: 0.42, y1: 0, x2: 1, y2: 1 } },
  {
    id: "ease-out",
    label: "Ease Out",
    value: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  },
  {
    id: "ease-in-out",
    label: "Ease In Out",
    value: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  },
  {
    id: "standard",
    label: "Standard",
    value: { x1: 0.4, y1: 0, x2: 0.2, y2: 1 },
  },
  {
    id: "decelerate",
    label: "Decelerate",
    value: { x1: 0, y1: 0, x2: 0.2, y2: 1 },
  },
  {
    id: "accelerate",
    label: "Accelerate",
    value: { x1: 0.4, y1: 0, x2: 1, y2: 1 },
  },
  // Overshoots past 1 and settles back. Legal CSS — only the x values are clamped to 0–1, y is
  // free — and the reason the curve editor has to render outside its own box.
  { id: "back", label: "Back", value: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 } },
];

function trim(value: number): string {
  // Three decimals is past the point of visible difference, and trailing zeroes just make the
  // declaration harder to read.
  return String(Number(value.toFixed(3)));
}

export function formatCubicBezier(bezier: CubicBezier): string {
  return `cubic-bezier(${trim(bezier.x1)}, ${trim(bezier.y1)}, ${trim(bezier.x2)}, ${trim(bezier.y2)})`;
}

export function formatEasingCss(
  bezier: CubicBezier,
  durationMs: number,
): string {
  return [
    `transition-timing-function: ${formatCubicBezier(bezier)};`,
    `transition-duration: ${durationMs}ms;`,
  ].join("\n");
}

/** One axis of a cubic bezier whose endpoints are pinned at 0 and 1. */
function axis(p1: number, p2: number, u: number): number {
  const v = 1 - u;
  return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
}

/**
 * The curve's own parameter at a given elapsed time.
 *
 * A CSS easing curve is parametric — both x and y are functions of an internal parameter, and the
 * x you want (elapsed time) doesn't map to that parameter linearly, so it has to be solved for.
 * Bisection rather than Newton's method: Newton converges faster but misbehaves on the
 * near-vertical segments that overshooting curves produce, and bisection is completely unbothered
 * by them.
 *
 * Exposed separately from the progress below because an editor needs the parameter itself, not
 * just the value there: how much each control point is influencing the curve at a given moment is
 * a function of the parameter, and that is what says where a drag at that moment should go.
 */
export function cubicBezierParamAtX(bezier: CubicBezier, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let low = 0;
  let high = 1;
  let guess = x;
  for (let i = 0; i < 24; i++) {
    const at = axis(bezier.x1, bezier.x2, guess);
    if (Math.abs(at - x) < 1e-5) break;
    if (at < x) low = guess;
    else high = guess;
    guess = (low + high) / 2;
  }
  return guess;
}

/** Progress at elapsed time `t` for a cubic-bezier timing function. */
export function cubicBezierProgress(bezier: CubicBezier, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return axis(bezier.y1, bezier.y2, cubicBezierParamAtX(bezier, t));
}
