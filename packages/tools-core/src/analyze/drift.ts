import { differenceEuclidean, formatHex, parse } from "culori";

/**
 * Pulls every color out of arbitrary text — a stylesheet, a theme file, a list someone pasted.
 *
 * Deliberately greedy and unstructured: it doesn't try to understand CSS, just to find colors
 * wherever they appear, because the useful input here is whatever someone happens to have on
 * their clipboard rather than a well-formed document. Deduped, preserving first appearance.
 */
export function parseColorList(text: string): string[] {
  const matches = text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of matches) {
    const parsed = parse(match);
    if (!parsed) continue;
    const hex = formatHex(parsed);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    result.push(hex);
  }
  return result;
}

export type DriftVerdict = "exact" | "near" | "unmatched";

export interface DriftCandidate {
  hex: string;
  /** How often it appeared, when the source counted. Drives ordering, since a near-miss used 400
   *  times is a very different problem from one used twice. */
  usage?: number;
}

export interface DriftEntry {
  hex: string;
  usage?: number;
  verdict: DriftVerdict;
  /** The palette color this is closest to. Absent only when the palette is empty. */
  nearestHex?: string;
  /** Perceptual distance to that color, in OKLab. */
  distance?: number;
}

export interface DriftReport {
  entries: DriftEntry[];
  exact: number;
  near: number;
  unmatched: number;
}

/**
 * How close two colors have to be before the difference is treated as a mistake rather than a
 * choice, as a Euclidean distance in OKLab.
 *
 * Calibrated by measurement, not taste — see the values checked in the drift verification: a
 * one-digit hex typo lands around 0.001, hand-retyped brand colors around 0.01, and genuinely
 * different palette entries sit an order of magnitude above that. 0.02 sits in the empty space
 * between "nobody could see this" and "these are different colors on purpose".
 */
export const NEAR_THRESHOLD = 0.02;

// OKLab rather than plain RGB distance, and Euclidean rather than CIEDE2000: OKLab is built so
// that equal numeric steps look like equal perceptual steps, which is exactly the property this
// needs, and it's the space the rest of the palette math already works in. CIEDE2000 would be
// marginally more accurate and a great deal harder to explain.
const distanceOf = differenceEuclidean("oklab");

function isColor(hex: string): boolean {
  return parse(hex) !== undefined;
}

/**
 * Compares the colors actually in use against the palette they were supposed to come from.
 *
 * The interesting output isn't the exact matches or the outright strangers — it's the near
 * misses. A color a hair off a palette entry is almost always drift: a hex retyped from memory, a
 * value nudged in a design tool and never reconciled, a third-party component shipping its own
 * blue. Those are invisible in a swatch list, because at a glance they look identical to the
 * thing they're drifting from, and that's precisely why they accumulate.
 */
export function analyzeDrift(
  candidates: DriftCandidate[],
  palette: string[],
): DriftReport {
  const reference = palette.filter(isColor).map((hex) => hex.toLowerCase());

  const entries: DriftEntry[] = candidates
    .filter((candidate) => isColor(candidate.hex))
    .map((candidate) => {
      const hex = candidate.hex.toLowerCase();
      if (reference.length === 0) {
        return { hex, usage: candidate.usage, verdict: "unmatched" as const };
      }

      let nearestHex = reference[0] as string;
      let best = Number.POSITIVE_INFINITY;
      for (const paletteHex of reference) {
        const distance = distanceOf(hex, paletteHex);
        if (distance < best) {
          best = distance;
          nearestHex = paletteHex;
        }
      }

      // Compared as hex rather than by distance, so a color that *is* a palette entry is reported
      // as exact even if rounding put its distance a hair above zero.
      const verdict: DriftVerdict = reference.includes(hex)
        ? "exact"
        : best <= NEAR_THRESHOLD
          ? "near"
          : "unmatched";

      return {
        hex,
        usage: candidate.usage,
        verdict,
        nearestHex,
        distance: best,
      };
    });

  // Near misses first, then unmatched, then exact — the order you'd want to act in. Within a
  // group, whatever is used most, since that's the biggest problem.
  const rank: Record<DriftVerdict, number> = {
    near: 0,
    unmatched: 1,
    exact: 2,
  };
  entries.sort(
    (a, b) =>
      rank[a.verdict] - rank[b.verdict] || (b.usage ?? 0) - (a.usage ?? 0),
  );

  return {
    entries,
    exact: entries.filter((e) => e.verdict === "exact").length,
    near: entries.filter((e) => e.verdict === "near").length,
    unmatched: entries.filter((e) => e.verdict === "unmatched").length,
  };
}
