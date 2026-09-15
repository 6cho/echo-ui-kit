import { formatHex, type Hsl, hsl, type Oklch, oklch, parse } from "culori";

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
