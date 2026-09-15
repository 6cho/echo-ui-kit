import { colorName } from "../color/name";
import {
  DEFAULT_TINT_SHADE_STEPS,
  generateTintShadeScale,
  type ScaleStep,
} from "../color/scale";

export type ExportFormat = "css" | "tailwind" | "scss" | "json";

export const EXPORT_FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "css", label: "CSS" },
  { id: "tailwind", label: "Tailwind" },
  { id: "scss", label: "SCSS" },
  { id: "json", label: "JSON" },
];

/** File extension for each format, so a consumer offering a download names the file sensibly. */
export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  css: "css",
  tailwind: "css",
  scss: "scss",
  json: "json",
};

export interface TokenScale {
  /** Hue-derived, deduped across the palette: "blue", "teal", "blue-2". */
  name: string;
  steps: ScaleStep[];
}

export interface TokenAlias {
  /** Role-based: "primary-500", "secondary-300", "accent-2-700". */
  name: string;
  hex: string;
  /** Which scale step this resolves to. Absent when the color isn't on any generated scale —
   *  an HSL-shifted image palette can land between steps — in which case the alias carries the
   *  literal hex instead of a reference. */
  scaleName?: string;
  step?: number;
}

export interface PaletteTokens {
  scales: TokenScale[];
  aliases: TokenAlias[];
}

// Column order *is* role order — the palette generator seeds column 0 most heavily, column 1 next,
// and treats everything past that as an accent. Naming them this way is what lets the aliases say
// something the raw scales can't: which color is doing which job.
function roleNames(count: number): string[] {
  const names: string[] = [];
  let accents = 0;
  for (let i = 0; i < count; i++) {
    if (i === 0) names.push("primary");
    else if (i === 1) names.push("secondary");
    else {
      accents++;
      names.push(accents === 1 ? "accent" : `accent-${accents}`);
    }
  }
  return names;
}

function uniqueScaleNames(baseColors: string[]): string[] {
  const counts = new Map<string, number>();
  return baseColors.map((hex) => {
    const base = colorName(hex);
    const seen = (counts.get(base) ?? 0) + 1;
    counts.set(base, seen);
    return seen === 1 ? base : `${base}-${seen}`;
  });
}

/**
 * Expands a palette into two layers: the full 100–900 ramp for every color in the scheme, and a
 * set of role-named aliases pointing at the specific steps that were actually selected.
 *
 * The two answer different questions and neither replaces the other. The ramps give you shades
 * that were never picked but are needed the moment a hover state or a disabled variant comes up —
 * exporting only the selection means going back to the generator for them. The aliases record the
 * decision the selection represents ("primary is this one"), which a ramp can't express, and are
 * what makes a later re-theme a one-line change instead of a find-and-replace.
 */
export function buildPaletteTokens(
  baseColors: string[],
  colors: string[],
): PaletteTokens {
  const scaleNames = uniqueScaleNames(baseColors);
  const roles = roleNames(baseColors.length);

  const scales: TokenScale[] = baseColors.map((base, i) => {
    let steps: ScaleStep[];
    try {
      steps = generateTintShadeScale(base, DEFAULT_TINT_SHADE_STEPS);
    } catch {
      steps = [{ step: 500, hex: base }];
    }
    return { name: scaleNames[i] as string, steps };
  });

  const usedNames = new Set<string>();
  const aliases: TokenAlias[] = colors.map((hex, index) => {
    const normalized = hex.toLowerCase();
    for (let i = 0; i < scales.length; i++) {
      const scale = scales[i] as TokenScale;
      const match = scale.steps.find((s) => s.hex.toLowerCase() === normalized);
      if (!match) continue;
      // A hex can repeat across scales at the extremes (every hue collapses toward the same
      // near-black), so the first scale that contains it wins and later duplicates get a distinct
      // name rather than silently overwriting the earlier token.
      let name = `${roles[i]}-${match.step}`;
      if (usedNames.has(name)) name = `${name}-${index + 1}`;
      usedNames.add(name);
      return { name, hex, scaleName: scale.name, step: match.step };
    }
    let name = `${colorName(hex)}-${index + 1}`;
    if (usedNames.has(name)) name = `${name}-alt`;
    usedNames.add(name);
    return { name, hex };
  });

  return { scales, aliases };
}

function reference(
  alias: TokenAlias,
  wrap: (scaleName: string, step: number) => string,
): string {
  if (!alias.scaleName || alias.step === undefined) return alias.hex;
  return wrap(alias.scaleName, alias.step);
}

/**
 * Renders the token set as copy-pasteable code.
 *
 * Aliases are emitted as *references* to the scale tokens rather than repeating the hex, in every
 * format whose syntax supports it. That's the whole point of shipping both layers: changing
 * `--color-blue-500` retints everything pointing at it, which duplicated literals would not do.
 * JSON is the exception — it has no reference syntax, so its aliases carry resolved values and
 * the scales are nested for a build step to walk.
 */
export function formatPaletteTokens(
  tokens: PaletteTokens,
  format: ExportFormat,
): string {
  const { scales, aliases } = tokens;
  if (scales.length === 0 && aliases.length === 0) return "";

  const scaleLines = scales.flatMap((scale) =>
    scale.steps.map((s) => ({ name: `${scale.name}-${s.step}`, hex: s.hex })),
  );

  switch (format) {
    case "css":
    case "tailwind": {
      const open = format === "css" ? ":root {" : "@theme {";
      return [
        open,
        "  /* Scales */",
        ...scaleLines.map(
          (l) => `  --color-${l.name}: ${l.hex.toLowerCase()};`,
        ),
        "",
        "  /* Palette */",
        ...aliases.map(
          (a) =>
            `  --color-${a.name}: ${reference(a, (s, step) => `var(--color-${s}-${step})`)};`,
        ),
        "}",
      ].join("\n");
    }
    case "scss":
      return [
        "// Scales",
        ...scaleLines.map((l) => `$color-${l.name}: ${l.hex.toLowerCase()};`),
        "",
        "// Palette",
        ...aliases.map(
          (a) =>
            `$color-${a.name}: ${reference(a, (s, step) => `$color-${s}-${step}`)};`,
        ),
      ].join("\n");
    case "json":
      return JSON.stringify(
        {
          scales: Object.fromEntries(
            scales.map((scale) => [
              scale.name,
              Object.fromEntries(
                scale.steps.map((s) => [String(s.step), s.hex.toLowerCase()]),
              ),
            ]),
          ),
          palette: Object.fromEntries(
            aliases.map((a) => [a.name, a.hex.toLowerCase()]),
          ),
        },
        null,
        2,
      );
  }
}
