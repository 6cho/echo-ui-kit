// Ambient global (no exports, so a plain import wouldn't pull it in) — a triple-slash reference
// forces it into any program that compiles this file, regardless of that program's own
// "include" glob. Without this, a consumer like apps/extension (whose tsconfig only includes
// its own directory) still type-checks this file directly since it's imported as raw source,
// but never sees the EyeDropper declaration that lives as a sibling file in this package.
/// <reference path="../types/eyedropper.d.ts" />

import {
  DEFAULT_TINT_SHADE_STEPS,
  fromHsl,
  generateHarmony,
  generateTintShadeScale,
  type HarmonyType,
  toHsl,
  toOklch,
} from "@echo-ui-kit/tools-core";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { extractPaletteFromImageFile } from "../lib/imagePalette";
import type { SavedPalette, WorkingPalette } from "../types/palette";
import { ColorScaleGrid } from "./ColorScaleGrid";
import { COLOR_WHEEL_VISUAL_INSET, ColorWheel } from "./ColorWheel";
import { ImageDropZone } from "./ImageDropZone";
import { PalettePreviewBar } from "./PalettePreviewBar";
import { Slider } from "./Slider";
import { ThreeDotMenu } from "./ThreeDotMenu";
import { ToolColumns, ToolWidth } from "./ToolColumns";

// How many dominant colors to ask k-means for — capped at hexadic's own 6-column ceiling, so an
// image-derived palette is never richer than the richest formula-based one. Still a request, not
// a guarantee: extractPaletteFromSamples merges clusters back down when they're not genuinely
// distinct (verified: an image with only 4 real colors still returns 4, not 6 padded with
// lookalikes), so this is a maximum, not a target.
const IMAGE_PALETTE_COLOR_COUNT = 6;

// Real photos and screenshots are often hazier/more muted than a designed palette — moves
// saturation this fraction of the way toward fully saturated (not a flat addition) so a
// near-gray extracted color still gets a real, visible boost instead of an imperceptible one,
// while an already-vivid color only gets a small polish rather than clipping at 100%. Verified
// numerically: 10% -> 37%, 78.5% -> 85%, 100% stays 100%.
const IMAGE_SATURATION_BOOST = 0.3;

function boostSaturation(hex: string): string {
  try {
    const parsed = toHsl(hex);
    const s = parsed.s ?? 0;
    return fromHsl({
      h: parsed.h ?? 0,
      s: s + (1 - s) * IMAGE_SATURATION_BOOST,
      l: parsed.l,
    });
  } catch {
    return hex;
  }
}

const HARMONY_TYPES: HarmonyType[] = [
  "monochromatic",
  "analogous",
  "complementary",
  "split-complementary",
  "triadic",
  "tetradic",
  "rectangle",
  "compound",
  "pentadic",
  "hexadic",
  "diad",
  "clash",
  "near-complementary",
];
// Below this OKLCH chroma, a color reads as essentially neutral gray — hue is barely (or not
// at all) perceptible, which is exactly what every hue-based feature here depends on.
const LOW_CHROMA_THRESHOLD = 0.02;

const HARMONY_LABELS: Record<HarmonyType, string> = {
  monochromatic: "Monochromatic",
  analogous: "Analogous",
  complementary: "Complementary",
  "split-complementary": "Split Complementary",
  triadic: "Triadic",
  tetradic: "Tetradic (Square)",
  rectangle: "Rectangle",
  compound: "Compound",
  pentadic: "Pentadic",
  hexadic: "Hexadic",
  diad: "Diad",
  clash: "Clash",
  "near-complementary": "Near-Complementary",
};

const HARMONY_DESCRIPTIONS: Record<HarmonyType, string> = {
  monochromatic: "One hue, varying lightness.",
  analogous: "Hues adjacent on the wheel, ~30° apart.",
  complementary: "Two hues directly opposite, 180° apart.",
  "split-complementary": "A hue plus the two neighbors of its complement.",
  triadic: "Three hues evenly spaced, 120° apart.",
  tetradic: "Four hues forming two complementary pairs, 90° apart.",
  rectangle: "Two complementary pairs, unevenly spaced.",
  compound: "Analogous hues plus a direct complementary accent.",
  pentadic: "Five hues evenly spaced, 72° apart.",
  hexadic: "Six hues evenly spaced, 60° apart.",
  diad: "Two hues a moderate 60° apart — subtler than complementary.",
  clash:
    "90° either side of the base, skipping the complement on purpose — deliberately discordant.",
  "near-complementary":
    "Near-opposite hues, 165° apart — softer than a true complement.",
};

// A 60-30-10-style role mapping, graduated by how often each role actually gets used in a real
// UI: Primary does the most work — background tints, the base tone, a hover-darker variant, and
// a text-safe dark shade — so it gets the fullest ramp. Secondary shows up often enough (outline
// buttons, chips, secondary surfaces) to need both directions too, but not the extremes: a
// light tint plus the base plus one hover-shade. Plain accents (the 3rd/4th hue) are used
// sparingly enough that base + one hover-shade covers it. Past four total hues, a harmony has
// moved from "a curated palette" to "a lot of colors" — each additional hue beyond that gets
// just its base tone, no hover-shade, so a 6-color harmony doesn't triple the effort of a
// 4-color one for marginal value.
const PRIMARY_ROLE_STEPS = [100, 500, 700, 900];
const SECONDARY_ROLE_STEPS = [300, 500, 700];
const ACCENT_ROLE_STEPS = [500, 700];
const SPARSE_ACCENT_ROLE_STEPS = [500];
// Column index (0 = primary) past which a harmony is treated as "past four colors" — columns
// 2-3 still get the full ACCENT_ROLE_STEPS treatment, only column 4 onward drops to one step.
const SPARSE_ACCENT_TIER_THRESHOLD = 4;

// The largest harmony (hexadic, 6 colors) auto-seeds 4 + 3 + 2×2 + 2×1 = 13 — this leaves
// headroom above that for manual additions before the palette bar's segments get too thin to
// stay comfortably hoverable/clickable.
const MAX_SELECTED_COLORS = 16;

function roleStepsForTier(tier: number): number[] {
  if (tier === 0) return PRIMARY_ROLE_STEPS;
  if (tier === 1) return SECONDARY_ROLE_STEPS;
  if (tier < SPARSE_ACCENT_TIER_THRESHOLD) return ACCENT_ROLE_STEPS;
  return SPARSE_ACCENT_ROLE_STEPS;
}

type ColumnScale = { step: number; hex: string }[];

// Always the full range from DEFAULT_TINT_SHADE_STEPS — the same constant ColorScaleGrid uses
// for its own rendering — rather than a partial array or an implicit default. Two reasons: (1)
// generateTintShadeScale's math is normalized against a step's *position* within whatever array
// it's given, so asking for just [500, 700] directly would treat 700 as the most extreme step
// and it'd come out nearly black instead of a moderate hover-darker shade; (2) if this ever
// passed a *different* default than ColorScaleGrid's, the hex for "step 700" here wouldn't match
// the hex ColorScaleGrid actually renders for step 700, and the grid's selected-cell highlight
// would silently stop matching the auto-seeded colors — which is exactly the bug that happened
// before this was made explicit.
function fullColumnScale(base: string): ColumnScale {
  try {
    return generateTintShadeScale(base, DEFAULT_TINT_SHADE_STEPS);
  } catch {
    return [{ step: 500, hex: base }];
  }
}

/** Auto-selects the role-based shades for each column's full scale, per roleStepsForTier. */
function principledSeedColors(columnScales: ColumnScale[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  columnScales.forEach((scale, tier) => {
    for (const step of roleStepsForTier(tier)) {
      const entry = scale.find((s) => s.step === step);
      if (entry && !seen.has(entry.hex)) {
        seen.add(entry.hex);
        result.push(entry.hex);
      }
    }
  });
  return result;
}

/** Which column (0 = primary) a given hex's shade scale contains — used only to size its chip
 *  in the "Selected Palette" list, so the 60-30-10 role hierarchy stays visible even after
 *  manual additions/removals reorder or thin out the set. */
/**
 * Where each colour sits in the palette's own layout: by column first, then light to dark within
 * it, so a strip of them reads as the scheme rather than as the order they happened to be
 * clicked in. The base colour's column is column zero, so it leads.
 *
 * Built as a lookup rather than searched per comparison — a sort calls its comparator O(n log n)
 * times, and each call was scanning every step of every column. More to the point, the search
 * returned -1 for anything it couldn't place and the caller read that as column zero, so a colour
 * that wasn't in any scale sorted ahead of the base. Unplaceable colours now sort last, which is
 * the only honest answer.
 */
function paletteOrder(columnScales: ColumnScale[]): Map<string, number> {
  const order = new Map<string, number>();
  columnScales.forEach((scale, column) => {
    scale.forEach((step, tier) => {
      const key = step.hex.toLowerCase();
      if (!order.has(key)) order.set(key, column * 1000 + tier);
    });
  });
  return order;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
      {children}
    </span>
  );
}

/** Shared "here's the one thing driving the palette" row — a fixed-size square visual on the
 *  left (a color swatch, a thumbnail, whatever fits), a title/subtitle stack in the middle, and
 *  an optional action on the right, all inside the same bordered card. Base Color and Source
 *  Image both describe the single input everything else derives from, so they should read as
 *  the same kind of control instead of two differently-styled rows that just happen to live in
 *  the same panel. */
function SourceRow({
  visual,
  title,
  titleClassName,
  subtitle,
  action,
}: {
  visual: ReactNode;
  title: string;
  titleClassName?: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-black/10 p-2 dark:border-white/10">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md">
        {visual}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate text-xs font-medium text-zinc-700 dark:text-zinc-300 ${titleClassName ?? ""}`}
        >
          {title}
        </span>
        <span className="truncate text-[11px] text-zinc-500">{subtitle}</span>
      </div>
      {action}
    </div>
  );
}

export function PaletteGenerator({
  onSave,
  onSaveColor,
  onWorkingPaletteChange,
  onColorFocused,
  paletteToLoad,
  onPaletteLoaded,
}: {
  /** Persisting the palette is the caller's job — this only hands back what was built. Keeps
   *  the "where do saved palettes live, and who else needs to know about a new one" question
   *  answered in one place (the caller), rather than duplicated into every component that can
   *  produce a palette. */
  onSave: (palette: Omit<SavedPalette, "id" | "createdAt">) => void;
  /** Omit to skip the "Save color" action in the selected-color footer — same reasoning as
   *  onSave: persistence is the caller's job. */
  onSaveColor?: (hex: string) => void;
  /** Fires whenever the working palette changes, so sibling tools (contrast scoring, token
   *  export) can operate on what's being actively built rather than only on saved palettes.
   *  Must be referentially stable — a fresh closure each render re-fires this on every render. */
  onWorkingPaletteChange?: (palette: WorkingPalette) => void;
  /** Fires when a color is clicked anywhere in the grid or wheel. Used to build the recent-colors
   *  history; unlike the above this only runs from an event handler, so it needn't be stable. */
  onColorFocused?: (hex: string) => void;
  /** A previously-saved palette to restore into the editor. Applied once, then onPaletteLoaded
   *  fires so the caller can clear it — which is also what lets the *same* palette be loaded
   *  again later, since an unchanged value wouldn't retrigger anything. */
  paletteToLoad?: SavedPalette | null;
  onPaletteLoaded?: () => void;
}) {
  const [baseColor, setBaseColor] = useState("#3b82f6");
  // Whichever swatch was clicked most recently, anywhere in the grid/wheel/bars — set inside
  // toggleColor below, alongside (not instead of) its existing add/remove-from-palette job, so
  // clicking a swatch keeps doing what it already did while also surfacing this footer.
  const [focusedColor, setFocusedColor] = useState<string | null>(null);
  // Feature-detected rather than assumed — this is a standard Web API (works the same in a
  // future web-app host, no extension permission needed for it either), but not every browser
  // implements it, so the button below only renders when it'll actually work.
  const supportsEyeDropper = typeof EyeDropper !== "undefined";

  async function pickColorFromScreen() {
    if (!supportsEyeDropper) return;
    try {
      const result = await new EyeDropper().open();
      setBaseColor(result.sRGBHex);
    } catch (error) {
      // AbortError fires when the user cancels (Escape, or clicking without landing on a pixel)
      // — expected, not a failure worth surfacing. Anything else still gets logged since there's
      // no dedicated error UI for this button.
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Eyedropper failed", error);
    }
  }
  const [harmony, setHarmony] = useState<HarmonyType>("analogous");
  const [saved, setSaved] = useState(false);
  const [colorSaved, setColorSaved] = useState(false);

  function saveColor(hex: string) {
    if (!onSaveColor) return;
    onSaveColor(hex);
    setColorSaved(true);
    setTimeout(() => setColorSaved(false), 1500);
  }

  // Whether the palette is being built from a harmony formula (the original mode) or extracted
  // from an uploaded image — these are different enough sources (one hue-rotated from a base
  // color, the other whatever colors an image actually contained) that they need separate state
  // for "what's selected," but everything downstream of `columns` (scales, tiers, the wheel, the
  // bars) stays generic over "however many colors, however they were produced."
  const [paletteSource, setPaletteSource] = useState<"harmony" | "image">(
    "harmony",
  );
  const [imageColors, setImageColors] = useState<string[] | null>(null);
  // Overrides the extracted primary color's H/S/L when the image-mode sliders have been
  // touched — null means "show the image exactly as extracted." Kept separate from
  // `imageColors` itself (which always stays the untouched, original extraction) so the delta
  // between this and the original primary's own HSL can be computed and applied uniformly to
  // every extracted color — see adjustedImageColors below.
  const [imageHslAdjustment, setImageHslAdjustment] = useState<{
    h: number;
    s: number;
    l: number;
  } | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isExtractingPalette, setIsExtractingPalette] = useState(false);
  const [imageExtractionError, setImageExtractionError] = useState<
    string | null
  >(null);

  async function processImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setImageExtractionError("That file isn't an image");
      return;
    }
    setIsExtractingPalette(true);
    setImageExtractionError(null);
    try {
      const extracted = await extractPaletteFromImageFile(
        file,
        IMAGE_PALETTE_COLOR_COUNT,
      );
      if (extracted.length === 0) {
        setImageExtractionError(
          "Couldn't find any usable colors in that image",
        );
        return;
      }
      // Boosted right here, at the moment extraction lands — not via the slider/delta
      // mechanism below — so it's baked into what "the original extracted color" even means for
      // this image. That keeps the Saturation slider's own math untouched: it still reads and
      // edits the (now-boosted) baseline directly, same as always, and each color gets its own
      // proportional boost instead of a single shared delta that could clip an already-vivid
      // color at 100% while barely moving a muted one.
      setImageColors(extracted.map((c) => boostSaturation(c.hex)));
      // A new image means the old custom selection (if any) was tuned for colors that no longer
      // exist — dropping it falls back to the principled seed for the new set instead of
      // silently carrying over stale hexes that aren't even in this image. Same reasoning for
      // the HSL adjustment: a delta computed against the old image's primary color has nothing
      // meaningful to apply to a brand new one.
      setImageSelectedColors(null);
      setImageHslAdjustment(null);
      setImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    } catch (error) {
      console.error("Image palette extraction failed", error);
      setImageExtractionError(
        error instanceof Error
          ? error.message
          : "Could not extract colors from that image",
      );
    } finally {
      setIsExtractingPalette(false);
    }
  }

  function clearImage() {
    setImageColors(null);
    setImageSelectedColors(null);
    setImageHslAdjustment(null);
    setImageExtractionError(null);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  const harmonyColors = useMemo(() => {
    try {
      return generateHarmony(baseColor, harmony);
    } catch {
      return [];
    }
  }, [baseColor, harmony]);

  const isBaseGrayscale = useMemo(() => {
    try {
      return toOklch(baseColor).c < LOW_CHROMA_THRESHOLD;
    } catch {
      return false;
    }
  }, [baseColor]);

  // These sliders don't hold their own state — they read the base color's current H/S/L and,
  // on drag, write a new base color back with just that one component changed. Nothing else in
  // the file needs to know sliders exist: harmonyColors, every column's tint/shade scale, and
  // the auto-seeded selection all already recompute from baseColor on every render, so a slider
  // moving the base color cascades through the *entire* palette for free — the same reason the
  // eyedropper and color-wheel clicks already do.
  const baseHsl = useMemo(() => {
    try {
      const parsed = toHsl(baseColor);
      return { h: parsed.h ?? 0, s: parsed.s ?? 0, l: parsed.l };
    } catch {
      return { h: 0, s: 0, l: 0.5 };
    }
  }, [baseColor]);

  function updateBaseHue(hue: number) {
    setBaseColor(fromHsl({ h: hue, s: baseHsl.s, l: baseHsl.l }));
  }
  function updateBaseSaturation(saturationPercent: number) {
    setBaseColor(
      fromHsl({ h: baseHsl.h, s: saturationPercent / 100, l: baseHsl.l }),
    );
  }
  function updateBaseLightness(lightnessPercent: number) {
    setBaseColor(
      fromHsl({ h: baseHsl.h, s: baseHsl.s, l: lightnessPercent / 100 }),
    );
  }

  // The image-mode sliders work the same way in spirit — moving the whole palette together —
  // but there's no single "base color" driving generation the way harmony mode has, so they
  // can't just call setBaseColor. Instead: the primary (most prominent) extracted color's own
  // H/S/L is what the sliders show and edit, and the *delta* between that and its original,
  // untouched value gets applied uniformly to every other extracted color — the whole group
  // shifts together, preserving how they relate to each other, exactly like dragging the
  // harmony sliders does for a formula-generated palette.
  const originalImagePrimaryHsl = useMemo(() => {
    const first = imageColors?.[0];
    if (!first) return { h: 0, s: 0, l: 0.5 };
    try {
      const parsed = toHsl(first);
      return { h: parsed.h ?? 0, s: parsed.s ?? 0, l: parsed.l };
    } catch {
      return { h: 0, s: 0, l: 0.5 };
    }
  }, [imageColors]);

  const imagePrimaryHsl = imageHslAdjustment ?? originalImagePrimaryHsl;

  function updateImageHue(hue: number) {
    setImageHslAdjustment({
      h: hue,
      s: imagePrimaryHsl.s,
      l: imagePrimaryHsl.l,
    });
  }
  function updateImageSaturation(saturationPercent: number) {
    setImageHslAdjustment({
      h: imagePrimaryHsl.h,
      s: saturationPercent / 100,
      l: imagePrimaryHsl.l,
    });
  }
  function updateImageLightness(lightnessPercent: number) {
    setImageHslAdjustment({
      h: imagePrimaryHsl.h,
      s: imagePrimaryHsl.s,
      l: lightnessPercent / 100,
    });
  }

  // One "Adjust" section renders regardless of mode (see the JSX below) — these three just
  // dispatch to whichever underlying mechanism is actually live, so the section doesn't need to
  // know or care which mode it's in, and there's exactly one set of sliders in the markup
  // instead of two near-identical copies.
  const activeHsl = paletteSource === "image" ? imagePrimaryHsl : baseHsl;
  // What the sliders currently resolve to, as a real color — fills each thumb (see Slider's
  // thumbColor), so all three sliders visibly agree on "this is the color you're dialing in" as
  // you drag any one of them, the same way the wheel's markers are filled with their own color
  // rather than a generic white handle.
  const activeColorHex = useMemo(() => {
    try {
      return fromHsl(activeHsl);
    } catch {
      return "#71717a";
    }
  }, [activeHsl]);
  function updateHue(hue: number) {
    if (paletteSource === "image") updateImageHue(hue);
    else updateBaseHue(hue);
  }
  function updateSaturation(saturationPercent: number) {
    if (paletteSource === "image") updateImageSaturation(saturationPercent);
    else updateBaseSaturation(saturationPercent);
  }
  function updateLightness(lightnessPercent: number) {
    if (paletteSource === "image") updateImageLightness(lightnessPercent);
    else updateBaseLightness(lightnessPercent);
  }

  const adjustedImageColors = useMemo(() => {
    if (!imageColors) return [];
    if (!imageHslAdjustment) return imageColors;
    const deltaH = imageHslAdjustment.h - originalImagePrimaryHsl.h;
    const deltaS = imageHslAdjustment.s - originalImagePrimaryHsl.s;
    const deltaL = imageHslAdjustment.l - originalImagePrimaryHsl.l;
    return imageColors.map((hex) => {
      try {
        const parsed = toHsl(hex);
        return fromHsl({
          h: ((((parsed.h ?? 0) + deltaH) % 360) + 360) % 360,
          s: Math.min(1, Math.max(0, (parsed.s ?? 0) + deltaS)),
          l: Math.min(1, Math.max(0, parsed.l + deltaL)),
        });
      } catch {
        return hex;
      }
    });
  }, [imageColors, imageHslAdjustment, originalImagePrimaryHsl]);

  // In image mode, columns are the (possibly HSL-shifted) extracted colors — index 0 is still
  // the most prominent one, adjustment or not. In harmony mode, unchanged: base color first,
  // then the rest of the harmony colors, deduped.
  const columns = useMemo(() => {
    if (paletteSource === "image") return adjustedImageColors;
    return Array.from(new Set([baseColor, ...harmonyColors]));
  }, [paletteSource, adjustedImageColors, baseColor, harmonyColors]);

  // Each harmony type remembers its own palette selection. One you haven't clicked anything in
  // yet has no entry here, so it "live" tracks the principled seed for the base + harmony colors
  // — switch to it and it always shows the current scheme. The moment you toggle a color while
  // on it, it gets an explicit entry and freezes as your own custom set from then on, independent
  // of further base-color or harmony changes — switching away and back restores exactly that set.
  const [selectedByHarmony, setSelectedByHarmony] = useState<
    Partial<Record<HarmonyType, string[]>>
  >({});
  // Image mode's equivalent of selectedByHarmony — there's no HarmonyType to key it by, so it's
  // just "customized or not" for whatever image is currently loaded. Reset to null (falls back
  // to the principled seed) whenever a new image is processed, same reasoning as switching
  // harmony types: a customization tuned for the old color set doesn't carry over meaningfully.
  const [imageSelectedColors, setImageSelectedColors] = useState<
    string[] | null
  >(null);

  const isCustomized =
    paletteSource === "image"
      ? imageSelectedColors !== null
      : harmony in selectedByHarmony;

  // Full 9-step scale per column — both the principled seed and the chip-tier lookup below pick
  // specific steps out of this rather than requesting a partial scale directly (see
  // fullColumnScale's comment for why that matters).
  const columnScales = useMemo(() => columns.map(fullColumnScale), [columns]);

  // Memoized specifically so its identity is stable between renders. principledSeedColors builds
  // a brand new array every call, so computing this inline would hand the effect below a
  // different array each render — it would fire, set state in the parent, re-render, and fire
  // again forever.
  const selectedColors = useMemo(
    () =>
      paletteSource === "image"
        ? (imageSelectedColors ?? principledSeedColors(columnScales))
        : (selectedByHarmony[harmony] ?? principledSeedColors(columnScales)),
    [
      paletteSource,
      imageSelectedColors,
      selectedByHarmony,
      harmony,
      columnScales,
    ],
  );

  const displaySelectedColors = useMemo(() => {
    const order = paletteOrder(columnScales);
    const place = (hex: string) =>
      order.get(hex.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    return [...selectedColors].sort((a, b) => place(a) - place(b));
  }, [selectedColors, columnScales]);

  // The complete description of what's currently being built, in the same shape saving produces —
  // so the parent can hand it straight to onSave, stash it as recent work, or read just its
  // colors for the contrast and export tools, without reassembling it from parts.
  const workingPalette = useMemo(
    () => ({
      baseColor:
        paletteSource === "image" ? (columns[0] ?? baseColor) : baseColor,
      harmony: (paletteSource === "image" ? "image" : harmony) as
        | HarmonyType
        | "image",
      colors: displaySelectedColors,
      // The scheme's columns, in role order. Not part of a saved palette — it's regenerable from
      // baseColor + harmony — but image-derived columns aren't, and the export tool needs them
      // either way to emit a full 100–900 ramp per color rather than only the picked shades.
      columns,
    }),
    [paletteSource, columns, baseColor, harmony, displaySelectedColors],
  );

  useEffect(() => {
    onWorkingPaletteChange?.(workingPalette);
  }, [workingPalette, onWorkingPaletteChange]);

  // Restores a saved palette back into the editor.
  //
  // A harmony palette round-trips exactly: the base color and harmony type regenerate every
  // column, and the saved colors go back in as that harmony's custom selection. An image palette
  // can't — the source image isn't stored, so the original extracted columns are gone for good.
  // The honest reconstruction is to treat the saved colors themselves as the columns, which keeps
  // everything downstream (scales, wheel, grid highlighting) coherent and correctly shows every
  // saved color as selected. What's lost is the thumbnail and the shades you *didn't* pick.
  useEffect(() => {
    if (!paletteToLoad) return;
    if (paletteToLoad.harmony === "image") {
      setPaletteSource("image");
      setImageColors(paletteToLoad.colors);
      setImageSelectedColors(paletteToLoad.colors);
      setImageHslAdjustment(null);
      setImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } else {
      setPaletteSource("harmony");
      setBaseColor(paletteToLoad.baseColor);
      setHarmony(paletteToLoad.harmony);
      // Replaces the whole map rather than merging: loading a saved palette is a fresh start, and
      // leaving other harmonies' stale customizations around is exactly the bug that made "new
      // palette from a color" feel like it hadn't done anything.
      setSelectedByHarmony({ [paletteToLoad.harmony]: paletteToLoad.colors });
    }
    setFocusedColor(null);
    onPaletteLoaded?.();
  }, [paletteToLoad, onPaletteLoaded]);

  function toggleColor(hex: string) {
    setFocusedColor(hex);
    onColorFocused?.(hex);
    if (paletteSource === "image") {
      setImageSelectedColors((prev) => {
        const current = prev ?? principledSeedColors(columnScales);
        const isSelected = current.includes(hex);
        if (!isSelected && current.length >= MAX_SELECTED_COLORS) return prev;
        return isSelected
          ? current.filter((c) => c !== hex)
          : [...current, hex];
      });
      return;
    }
    setSelectedByHarmony((prev) => {
      const current = prev[harmony] ?? principledSeedColors(columnScales);
      const isSelected = current.includes(hex);
      // Only the "add" direction is capped — removing a color always has to work, including
      // when already at the cap, otherwise there'd be no way to free up a slot.
      if (!isSelected && current.length >= MAX_SELECTED_COLORS) return prev;
      const next = isSelected
        ? current.filter((c) => c !== hex)
        : [...current, hex];
      return { ...prev, [harmony]: next };
    });
  }

  // Drops the current mode's custom entry so it falls back to the principled seed again — which
  // "entry" that is depends on paletteSource, same branch as toggleColor above.
  function resetSelection() {
    if (paletteSource === "image") {
      setImageSelectedColors(null);
      return;
    }
    setSelectedByHarmony((prev) => {
      const next = { ...prev };
      delete next[harmony];
      return next;
    });
  }

  // Excludes the current harmony from the pool rather than picking from the full list every
  // time — a plain random pick has a 1-in-13 chance of silently "re-rolling" the same value,
  // which reads as a broken button rather than a randomizer that just happened to repeat.
  function randomizeHarmony() {
    const choices = HARMONY_TYPES.filter((type) => type !== harmony);
    const pool = choices.length > 0 ? choices : HARMONY_TYPES;
    setHarmony(pool[Math.floor(Math.random() * pool.length)] as HarmonyType);
  }

  function savePalette() {
    const { baseColor: base, harmony: type, colors } = workingPalette;
    onSave({ baseColor: base, harmony: type, colors });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  // Switches to harmony mode (a single color as a starting point is specifically what that mode
  // means) and seeds it as the base — everything else (harmonyColors, the scales, the
  // auto-seeded selection) cascades from there the same way any other base-color change does.
  function createPaletteFromColor(hex: string) {
    setPaletteSource("harmony");
    setBaseColor(hex);
    // Without this, any harmony type you'd previously customized keeps showing its old
    // customization (and the "(Custom)" tag) against the *new* base color — colors tuned for a
    // completely different starting point, which is exactly what made this feel like "just
    // changed the base color" instead of a genuinely new palette. Clearing it falls back to the
    // principled seed for whatever harmony is active, freshly computed from the new base color.
    setSelectedByHarmony({});
    setFocusedColor(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ToolColumns gap="6">
          {/* First thing in the panel, above everything it actually governs — Base color and
              the eyedropper only make sense in harmony mode, and having the switch sit below
              them (as it did before) made toggling it feel like it was reaching "up and out of
              scope" to hide a section above itself. Up here, it reads as the thing you decide
              before anything else. */}
          <div className="flex items-center justify-between gap-3">
            {/* min-w-0 lets this side actually shrink/wrap instead of forcing the toggle to
                give up its width first — that's what was squeezing "From Image" onto two lines. */}
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Palette source
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {paletteSource === "harmony"
                  ? "From a single base color"
                  : "Derived from an image"}
              </span>
            </div>
            {/* Mirrors the Palette/Saved tab switcher in the app shell so the same
                segmented-control language shows up wherever the app offers a choice between two
                views. shrink-0 + whitespace-nowrap so it always keeps its natural one-line
                width instead of being compressed by the label sharing this row. */}
            <div className="flex shrink-0 gap-1 clay-inset rounded-md bg-zinc-100 p-0.5 dark:bg-surface-elevated">
              {(["harmony", "image"] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => setPaletteSource(source)}
                  className={`cursor-pointer whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium transition active:scale-95 ${
                    paletteSource === source
                      ? "clay bg-white text-zinc-900 dark:bg-zinc-700 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  {source === "harmony" ? "Harmony" : "From Image"}
                </button>
              ))}
            </div>
          </div>

          {/* One "Source" section regardless of mode — same label, same SourceRow shape — instead
              of "Base color" and "Source image" being two differently-labeled sections that
              happened to end up visually similar. Only the *content* branches by mode; the slot
              itself doesn't. */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Source</SectionLabel>
            {paletteSource === "harmony" ? (
              <SourceRow
                visual={
                  <input
                    type="color"
                    aria-label="Base color"
                    value={baseColor}
                    onChange={(e) => setBaseColor(e.target.value)}
                    className="h-full w-full cursor-pointer"
                  />
                }
                title={baseColor}
                titleClassName="font-mono"
                subtitle="Drives the harmony, scales, and shades below"
                action={
                  supportsEyeDropper && (
                    <button
                      type="button"
                      onClick={pickColorFromScreen}
                      title="Pick a color from anywhere on screen"
                      className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-black/10 text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <title>Eyedropper</title>
                        <path d="m2 22 1-1h3l9-9" />
                        <path d="M3 21v-3l9-9" />
                        <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
                      </svg>
                    </button>
                  )
                }
              />
            ) : (
              <>
                {imageExtractionError && (
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    {imageExtractionError}
                  </p>
                )}
                {isExtractingPalette ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-black/10 px-3 py-6 dark:border-white/10">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-brand-500 dark:border-zinc-600" />
                    <span className="text-[11px] font-medium text-zinc-500">
                      Extracting colors…
                    </span>
                  </div>
                ) : imageColors && imageColors.length > 0 ? (
                  <SourceRow
                    visual={
                      imagePreviewUrl ? (
                        <img
                          src={imagePreviewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className="h-full w-full"
                          style={{ backgroundColor: imageColors[0] }}
                        />
                      )
                    }
                    title={`${imageColors.length} colors extracted`}
                    subtitle="Ranked by prominence in the image"
                    action={
                      <button
                        type="button"
                        onClick={clearImage}
                        className="shrink-0 cursor-pointer rounded-md border border-black/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
                      >
                        Change
                      </button>
                    }
                  />
                ) : (
                  <ImageDropZone
                    title="Drop an image, click to browse, or paste a screenshot"
                    subtitle="A photo or a UI screenshot both work"
                    onFile={processImageFile}
                  />
                )}
              </>
            )}
          </div>

          {paletteSource === "harmony" && isBaseGrayscale && (
            <p className="-mt-3 text-[11px] text-amber-600 dark:text-amber-500">
              This color has little to no saturation, so hue-based tools here
              (harmony, color wheel) won't have much to work with — most colors
              they generate will look close to gray too.
            </p>
          )}

          {/* One "Adjust" section regardless of mode too — activeHsl/updateHue/updateSaturation/
              updateLightness (defined above) already dispatch to whichever mechanism is
              actually live, so this markup doesn't need to know or care which mode it's in. */}
          {(paletteSource === "harmony" ||
            (imageColors && imageColors.length > 0)) && (
            <div className="flex flex-col gap-2.5">
              <SectionLabel>Adjust</SectionLabel>
              <Slider
                label="Hue"
                value={Math.round(activeHsl.h)}
                min={0}
                max={360}
                step={1}
                displayValue={`${Math.round(activeHsl.h)}°`}
                trackBackground="linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))"
                thumbColor={activeColorHex}
                onChange={updateHue}
              />
              <Slider
                label="Saturation"
                value={Math.round(activeHsl.s * 100)}
                min={0}
                max={100}
                step={1}
                displayValue={`${Math.round(activeHsl.s * 100)}%`}
                trackBackground={`linear-gradient(to right, hsl(${activeHsl.h} 0% ${activeHsl.l * 100}%), hsl(${activeHsl.h} 100% ${activeHsl.l * 100}%))`}
                thumbColor={activeColorHex}
                onChange={updateSaturation}
              />
              <Slider
                label="Lightness"
                value={Math.round(activeHsl.l * 100)}
                min={0}
                max={100}
                step={1}
                displayValue={`${Math.round(activeHsl.l * 100)}%`}
                trackBackground={`linear-gradient(to right, hsl(${activeHsl.h} ${activeHsl.s * 100}% 0%), hsl(${activeHsl.h} ${activeHsl.s * 100}% 50%), hsl(${activeHsl.h} ${activeHsl.s * 100}% 100%))`}
                thumbColor={activeColorHex}
                onChange={updateLightness}
              />
            </div>
          )}

          {paletteSource === "harmony" && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Harmony</SectionLabel>
              <div className="flex items-stretch gap-2">
                <div className="relative flex-1">
                  <select
                    value={harmony}
                    onChange={(e) => setHarmony(e.target.value as HarmonyType)}
                    className="clay-inset h-full w-full cursor-pointer appearance-none rounded-lg bg-zinc-100 py-1.5 pr-8 pl-2.5 text-xs font-medium text-zinc-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-100"
                  >
                    {HARMONY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {HARMONY_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-zinc-500">
                    ▾
                  </span>
                </div>
                <button
                  type="button"
                  onClick={randomizeHarmony}
                  title="Pick a random harmony"
                  className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-black/10 px-2.5 text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <title>Randomize harmony</title>
                    <rect width="18" height="18" x="3" y="3" rx="3" ry="3" />
                    <circle
                      cx="8"
                      cy="8"
                      r="1"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="16"
                      cy="8"
                      r="1"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="1"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="8"
                      cy="16"
                      r="1"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="16"
                      cy="16"
                      r="1"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {columns.length > 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-3">
                  {/* Always exactly the theoretical harmony colors (one per column), not
                      selectedColors — the wheel's job is to illustrate the scheme's geometry
                      (triadic 120° apart, etc.), and plotting every selected shade on top of
                      that turns it into a cluttered mess of near-duplicate markers instead. In
                      image mode there's no formula behind the extracted hues, so a real hue-angle
                      wheel would just be showing noise — "gradient" mode spaces the same markers
                      evenly instead and blends the ring between the actual palette colors. */}
                  <ColorWheel
                    colors={paletteSource === "image" ? columns : harmonyColors}
                    baseColor={
                      paletteSource === "image"
                        ? (columns[0] ?? baseColor)
                        : baseColor
                    }
                    mode={paletteSource === "image" ? "gradient" : "harmony"}
                    onToggleColor={toggleColor}
                  />
                  <div
                    className="flex flex-1 flex-col items-end gap-1 text-right"
                    style={{ paddingTop: COLOR_WHEEL_VISUAL_INSET }}
                  >
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">
                      {paletteSource === "image"
                        ? "From Image"
                        : HARMONY_LABELS[harmony]}
                    </span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {paletteSource === "image"
                        ? "Dominant colors pulled from your image, ranked by prominence."
                        : HARMONY_DESCRIPTIONS[harmony]}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                {/* Reset sits with the palette count rather than up by the wheel because that
                    count is exactly what it resets — the grid below is where a customized
                    selection is actually visible, so the escape hatch belongs at the same
                    level. min-h keeps the header from shifting the grid up and down as the
                    button appears and disappears with isCustomized. */}
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <SectionLabel>{`Palette (${selectedColors.length}/${MAX_SELECTED_COLORS})`}</SectionLabel>
                  {isCustomized && (
                    <button
                      type="button"
                      onClick={resetSelection}
                      title="Discard the customized selection and go back to the default scheme"
                      className="shrink-0 cursor-pointer rounded-full border border-zinc-300 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-surface-hover"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <ColorScaleGrid
                  baseColors={columns}
                  selectedColors={selectedColors}
                  onToggleColor={toggleColor}
                  canSelectMore={selectedColors.length < MAX_SELECTED_COLORS}
                />
              </div>
            </>
          )}
        </ToolColumns>
      </div>

      {/* Outside the scrollable region above (a sibling, not a child) so it stays pinned to the
          bottom of the panel regardless of scroll position, instead of scrolling away with the
          rest of the content. */}
      <ToolWidth className="flex shrink-0 flex-col gap-2 border-t border-black/10 p-4 dark:border-white/10">
        {focusedColor && (
          <SourceRow
            visual={
              <div
                className="h-full w-full"
                style={{ backgroundColor: focusedColor }}
              />
            }
            title={focusedColor}
            titleClassName="font-mono"
            subtitle="Selected color"
            action={
              <ThreeDotMenu
                items={[
                  {
                    label: "New palette",
                    onSelect: () => createPaletteFromColor(focusedColor),
                  },
                  ...(onSaveColor
                    ? [
                        {
                          label: colorSaved ? "Saved" : "Save color",
                          onSelect: () => saveColor(focusedColor),
                        },
                      ]
                    : []),
                ]}
              />
            }
          />
        )}
        <PalettePreviewBar
          colors={displaySelectedColors}
          actionLabel={saved ? "Saved" : "Save palette"}
          onAction={savePalette}
          title="Save this palette"
        />
      </ToolWidth>
    </div>
  );
}
