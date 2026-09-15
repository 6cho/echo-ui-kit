export interface FilterValues {
  blur: number;
  brightness: number;
  contrast: number;
  saturate: number;
  grayscale: number;
  sepia: number;
  invert: number;
  hueRotate: number;
  opacity: number;
}

export interface FilterFunctionSpec {
  key: keyof FilterValues;
  label: string;
  /** The CSS function name, which doesn't always match the key (`hueRotate` → `hue-rotate`). */
  cssName: string;
  unit: "px" | "%" | "deg";
  min: number;
  max: number;
  /** The value at which this function does nothing, so it can be omitted from the output. */
  neutral: number;
}

// Ordered the way they're most often reached for rather than alphabetically, and each one carries
// its own neutral value because "does nothing" isn't the same number across functions — blur is 0,
// brightness is 100%.
export const FILTER_FUNCTIONS: FilterFunctionSpec[] = [
  {
    key: "blur",
    label: "Blur",
    cssName: "blur",
    unit: "px",
    min: 0,
    max: 40,
    neutral: 0,
  },
  {
    key: "brightness",
    label: "Brightness",
    cssName: "brightness",
    unit: "%",
    min: 0,
    max: 300,
    neutral: 100,
  },
  {
    key: "contrast",
    label: "Contrast",
    cssName: "contrast",
    unit: "%",
    min: 0,
    max: 300,
    neutral: 100,
  },
  {
    key: "saturate",
    label: "Saturate",
    cssName: "saturate",
    unit: "%",
    min: 0,
    max: 300,
    neutral: 100,
  },
  {
    key: "grayscale",
    label: "Grayscale",
    cssName: "grayscale",
    unit: "%",
    min: 0,
    max: 100,
    neutral: 0,
  },
  {
    key: "sepia",
    label: "Sepia",
    cssName: "sepia",
    unit: "%",
    min: 0,
    max: 100,
    neutral: 0,
  },
  {
    key: "invert",
    label: "Invert",
    cssName: "invert",
    unit: "%",
    min: 0,
    max: 100,
    neutral: 0,
  },
  {
    key: "hueRotate",
    label: "Hue rotate",
    cssName: "hue-rotate",
    unit: "deg",
    min: 0,
    max: 360,
    neutral: 0,
  },
  {
    key: "opacity",
    label: "Opacity",
    cssName: "opacity",
    unit: "%",
    min: 0,
    max: 100,
    neutral: 100,
  },
];

export const NEUTRAL_FILTER: FilterValues = Object.fromEntries(
  FILTER_FUNCTIONS.map((spec) => [spec.key, spec.neutral]),
) as unknown as FilterValues;

/**
 * Builds the `filter` value, dropping every function still sitting at its neutral value.
 *
 * Emitting all nine regardless would be correct but wasteful, and actively misleading to read —
 * a declaration listing `grayscale(0%) sepia(0%)` reads as though something was intended there.
 * Order is preserved because filters compose in sequence: blurring then inverting does not look
 * like inverting then blurring.
 */
export function formatFilter(values: FilterValues): string {
  const parts = FILTER_FUNCTIONS.filter(
    (spec) => values[spec.key] !== spec.neutral,
  ).map((spec) => `${spec.cssName}(${values[spec.key]}${spec.unit})`);
  return parts.length === 0 ? "none" : parts.join(" ");
}

export function formatFilterCss(values: FilterValues): string {
  return `filter: ${formatFilter(values)};`;
}
