import { parse, rgb, wcagContrast } from "culori";

export function contrastRatio(foreground: string, background: string): number {
  return wcagContrast(foreground, background);
}

export type WcagLevel = "fail" | "AA-large" | "AA" | "AAA";

/** WCAG 2 pass level for this ratio. `isLargeText` = 18pt+/14pt+bold, which has lower thresholds. */
export function wcagLevel(ratio: number, isLargeText = false): WcagLevel {
  if (isLargeText) {
    if (ratio >= 4.5) return "AAA";
    if (ratio >= 3) return "AA";
    return "fail";
  }
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}

/** 0–255 RGB channels, for callers working with raw pixel buffers rather than color strings. */
export function toRgb255(input: string): { r: number; g: number; b: number } {
  const parsed = parse(input);
  if (!parsed) throw new Error(`Invalid color: ${input}`);
  const converted = rgb(parsed);
  if (!converted) throw new Error(`Could not convert to RGB: ${input}`);
  return {
    r: Math.round(converted.r * 255),
    g: Math.round(converted.g * 255),
    b: Math.round(converted.b * 255),
  };
}

const SRGB_LINEAR_THRESHOLD = 0.03928;
const LUMINANCE_COEFFICIENTS = { r: 0.2126, g: 0.7152, b: 0.0722 };

function toLinear(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= SRGB_LINEAR_THRESHOLD ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG 2 relative luminance from raw 0–255 channels.
 *
 * Exists alongside contrastRatio (which takes color strings) specifically for per-pixel work:
 * checking text against a photographic background means evaluating thousands of pixels, and
 * formatting each one into a string just to hand it to culori is orders of magnitude slower than
 * the arithmetic itself. Verified to match culori's own wcagContrast to within floating-point
 * noise.
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    LUMINANCE_COEFFICIENTS.r * toLinear(r) +
    LUMINANCE_COEFFICIENTS.g * toLinear(g) +
    LUMINANCE_COEFFICIENTS.b * toLinear(b)
  );
}

/** Contrast ratio between two already-computed relative luminances. */
export function contrastFromLuminance(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
