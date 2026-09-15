import { clampChroma, formatHex, type Oklch } from "culori";
import { toOklch } from "./convert";

export type HarmonyType =
  | "monochromatic"
  | "analogous"
  | "complementary"
  | "split-complementary"
  | "triadic"
  | "tetradic"
  | "rectangle"
  | "compound"
  | "pentadic"
  | "hexadic"
  | "diad"
  | "clash"
  | "near-complementary";

const HUE_OFFSETS: Record<Exclude<HarmonyType, "monochromatic">, number[]> = {
  analogous: [0, 30, -30],
  complementary: [0, 180],
  "split-complementary": [0, 150, 210],
  triadic: [0, 120, 240],
  tetradic: [0, 90, 180, 270],
  // Two complementary pairs, unevenly spaced — distinct from tetradic's even 90° square.
  rectangle: [0, 60, 180, 240],
  // Analogous neighbors plus a direct complementary accent.
  compound: [0, -30, 30, 180],
  pentadic: [0, 72, 144, 216, 288],
  hexadic: [0, 60, 120, 180, 240, 300],
  // Niche: two hues a moderate 60° apart — subtler than analogous or complementary.
  diad: [0, 60],
  // Niche: 90° either side of the base, deliberately skipping the 180° complement for a
  // jarring, discordant feel rather than a balanced one.
  clash: [0, 90, -90],
  // Niche: near-opposite (165° instead of a true 180°) — softer than a full complement.
  "near-complementary": [0, 165],
};

function rotateHue(hue: number, degrees: number): number {
  return (hue + degrees + 360) % 360;
}

// Rotating hue while holding L/C fixed can land outside sRGB at some hues — formatHex would
// otherwise silently clip it via a raw RGB clamp, which distorts hue along with chroma (this is
// what broke tetradic's even 90° spacing: two of its four colors were landing 75-97° apart
// instead of 90°). clampChroma reduces chroma at that exact hue/lightness until it's
// displayable, so the hue this function targeted is the hue you actually get.
function toDisplayableHex(color: Oklch): string {
  const hex = formatHex(clampChroma(color, "oklch"));
  if (!hex)
    throw new Error(`Could not format color as hex: ${JSON.stringify(color)}`);
  return hex;
}

export function generateHarmony(
  baseColor: string,
  type: HarmonyType,
): string[] {
  const base = toOklch(baseColor);

  // Monochromatic is one hue, no rotation — and "varying lightness" is already what every
  // column's 9-step tint/shade scale does downstream, at finer granularity than any fixed list
  // of lightness values here could. Returning more than one color would make the caller treat
  // each as its own separate hue column, each getting its own full tint/shade ramp — the same
  // hue expanding into a wall of near-duplicate columns instead of just its one real scale.
  if (type === "monochromatic") {
    return [toDisplayableHex(base)];
  }

  const hue = base.h ?? 0;
  return HUE_OFFSETS[type].map((offset) =>
    toDisplayableHex({ ...base, h: rotateHue(hue, offset) }),
  );
}
