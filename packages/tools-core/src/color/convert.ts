import {
  formatHex,
  type Hsl,
  hsl,
  hsv,
  type Oklch,
  oklch,
  parse,
} from "culori";

export function toOklch(input: string): Oklch {
  const parsed = parse(input);
  if (!parsed) throw new Error(`Invalid color: ${input}`);
  const converted = oklch(parsed);
  if (!converted) throw new Error(`Could not convert to OKLCH: ${input}`);
  return converted;
}

export function toHex(color: Oklch): string {
  return formatHex(color);
}

export function toHsl(input: string): Hsl {
  const parsed = parse(input);
  if (!parsed) throw new Error(`Invalid color: ${input}`);
  const converted = hsl(parsed);
  if (!converted) throw new Error(`Could not convert to HSL: ${input}`);
  return converted;
}

/** The inverse of toHsl — builds a hex color directly from H/S/L, for UI controls (sliders,
 *  etc.) that manipulate those components directly rather than picking a color some other way. */
export function fromHsl(components: {
  h: number;
  s: number;
  l: number;
}): string {
  const hex = formatHex({ mode: "hsl", ...components });
  if (!hex) {
    throw new Error(
      `Could not format HSL as hex: ${JSON.stringify(components)}`,
    );
  }
  return hex;
}

/** Hue (degrees), saturation and value (0–1), for a saturation/brightness picker square. A grey
 *  has no hue and comes back as 0 — callers that need to keep one across a grey hold it
 *  themselves. */
export function toHsv(input: string): { h: number; s: number; v: number } {
  const parsed = parse(input);
  const converted = parsed ? hsv(parsed) : undefined;
  if (!converted) throw new Error(`Could not convert to HSV: ${input}`);
  return { h: converted.h ?? 0, s: converted.s, v: converted.v };
}

export function fromHsv(components: {
  h: number;
  s: number;
  v: number;
}): string {
  const hex = formatHex({ mode: "hsv", ...components });
  if (!hex) {
    throw new Error(
      `Could not format HSV as hex: ${JSON.stringify(components)}`,
    );
  }
  return hex;
}

/** The inverse of contrast.ts's toRgb255: whole 0–255 channels back to hex. */
export function fromRgb255(components: {
  r: number;
  g: number;
  b: number;
}): string {
  return formatHex({
    mode: "rgb",
    r: components.r / 255,
    g: components.g / 255,
    b: components.b / 255,
  });
}
