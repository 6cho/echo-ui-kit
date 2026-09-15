import {
  DEFAULT_TINT_SHADE_STEPS,
  generateTintShadeScale,
} from "@echo-ui-kit/tools-core";
import { useMemo } from "react";

// Fixed per-segment height rather than a flex-1 subdivision of some explicit container height —
// every column ends up the exact same total height (steps.length × this) automatically, with no
// need to coordinate an outer height for flex-1 children to fill.
const SEGMENT_HEIGHT = "h-4";

/**
 * One tint/shade scale per base color, laid out as columns so they can be compared side by
 * side — the 500 step of each column reproduces that column's base color exactly, so there's
 * no separate header row; the scale itself doubles as the label. Each column renders as one
 * continuous rounded-rect bar (steps touching, only the whole column's corners rounded) rather
 * than nine separate pill-shaped cells with gaps between them — a "selected" step is marked
 * with an inset ring instead of its own border, since a border would eat into the touching
 * edges and break the continuous look.
 */
export function ColorScaleGrid({
  baseColors,
  steps = DEFAULT_TINT_SHADE_STEPS,
  selectedColors,
  onToggleColor,
  canSelectMore = true,
}: {
  baseColors: string[];
  steps?: number[];
  /** Hexes to mark as selected (white ring) — pairs with onToggleColor. */
  selectedColors?: string[];
  /** When provided, every segment becomes clickable to toggle its membership in
   *  selectedColors. */
  onToggleColor?: (hex: string) => void;
  /** False once the caller's selection has hit its cap — segments not already selected render
   *  disabled instead of silently doing nothing on click, so it's clear the palette is full
   *  rather than looking broken. Already-selected segments stay clickable so removing one to
   *  make room still works. */
  canSelectMore?: boolean;
}) {
  // A very dark or very light base color can force multiple shade steps to the same rendered
  // hex (8-bit sRGB can't represent the tiny OKLCH lightness differences near true black/white
  // — no amount of spreading the math fixes that, it's a real display quantization floor). This
  // collision isn't confined to one column either: two *different* base hues can both collapse
  // toward the same near-black/near-white hex at their extremes, so the dedup has to be shared
  // across every column, not reset per column — otherwise a hex that's genuinely selected only
  // once (selectedColors is itself globally deduped by principledSeedColors) would still light
  // up as "selected" in two different columns' segments, which reads as a bug even though the
  // underlying selection is correct. Only one segment per unique hex is ever eligible to show
  // the selected indicator; every later duplicate still toggles correctly on click, it just
  // doesn't double up the highlight.
  //
  // Within a single column, 500 (the base tone) claims the indicator over any other step it
  // ties with — scanning steps in plain ascending order would instead hand it to whichever tied
  // step is numerically smallest (100), which looks wrong: 500 is the anchor every other step is
  // defined relative to, so a near-white/near-black column's indicator belongs on it specifically,
  // not on the earliest step that happens to share its hex. This is purely a display choice —
  // the hex value stored in selectedColors is identical either way, so it doesn't change what's
  // actually selected, only which cell gets to show it.
  const columns = useMemo(() => {
    const seenHexes = new Set<string>();
    return baseColors.map((base) => {
      let scale: { step: number; hex: string }[];
      try {
        scale = generateTintShadeScale(base, steps);
      } catch {
        scale = steps.map((step) => ({ step, hex: base }));
      }

      const priorityOrder = [...scale].sort((a, b) => {
        if (a.step === 500) return -1;
        if (b.step === 500) return 1;
        return 0;
      });
      const firstOccurrenceByStep = new Map<number, boolean>();
      for (const entry of priorityOrder) {
        const isFirstOccurrence = !seenHexes.has(entry.hex);
        seenHexes.add(entry.hex);
        firstOccurrenceByStep.set(entry.step, isFirstOccurrence);
      }

      return scale.map((entry) => ({
        ...entry,
        isFirstOccurrence: firstOccurrenceByStep.get(entry.step) ?? true,
      }));
    });
  }, [baseColors, steps]);

  return (
    <div className="flex gap-1.5">
      {/* Label column — same fixed per-step height as each segment below, so "100" through
          "900" line up exactly with the row each one names regardless of how many columns
          there are. */}
      <div className="flex flex-col">
        {steps.map((step) => (
          <span
            key={step}
            className={`flex ${SEGMENT_HEIGHT} items-center font-mono text-[11px] text-zinc-500`}
          >
            {step}
          </span>
        ))}
      </div>

      <div className="flex flex-1 gap-1">
        {columns.map((column, colIndex) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed column layout, columns never reorder within a render
            key={colIndex}
            className="flex flex-1 flex-col overflow-hidden rounded-xl border border-black/10 dark:border-white/10"
          >
            {column.map((cell, rowIndex) => {
              const step = steps[rowIndex];
              const hex = cell?.hex ?? baseColors[colIndex] ?? "#000000";
              const isSelected =
                cell.isFirstOccurrence && selectedColors?.includes(hex);
              const isDisabled =
                Boolean(onToggleColor) && !isSelected && !canSelectMore;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed column layout, columns never reorder within a render
                  key={`cell-${colIndex}-${step}`}
                  type="button"
                  onClick={onToggleColor ? () => onToggleColor(hex) : undefined}
                  disabled={isDisabled}
                  title={
                    isDisabled
                      ? "Palette is full — remove a color to add another"
                      : hex
                  }
                  style={{ backgroundColor: isDisabled ? undefined : hex }}
                  // Brightness, not active:scale — these segments touch with no gap between
                  // them (the whole point of the merged-column look), and scaling one down
                  // would shrink it toward its center while its neighbors stay put, opening a
                  // gap that exposes the transparent container behind it. A brightness pulse
                  // gives the same "pressed" feedback with no layout/paint risk.
                  className={`relative ${SEGMENT_HEIGHT} w-full shrink-0 transition ${
                    isDisabled
                      ? "cursor-not-allowed bg-zinc-300 dark:bg-zinc-600"
                      : "cursor-pointer hover:brightness-110 active:brightness-125"
                  }`}
                >
                  {/* A ring here (as before) drew a hard white bar across the touching edges,
                      breaking the whole point of a continuous column. A small centered
                      checkmark with its own drop shadow reads clearly against any segment
                      color without interrupting the seam at all. */}
                  {isSelected && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-2.5 w-2.5 drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.7)]"
                        aria-hidden="true"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
