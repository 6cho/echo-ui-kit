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
  selectedPositions,
  onToggleColor,
  canSelectMore = true,
}: {
  baseColors: string[];
  steps?: number[];
  /** Cells to mark as selected, as "column:step" — pairs with onToggleColor. */
  selectedPositions?: string[];
  /** When provided, every segment becomes clickable. Says which cell, not just which colour,
   *  because several cells can be the same colour at the extremes of lightness and are still
   *  different picks. */
  onToggleColor?: (hex: string, position: string) => void;
  /** False once the caller's selection has hit its cap — segments not already selected render
   *  disabled instead of silently doing nothing on click, so it's clear the palette is full
   *  rather than looking broken. Already-selected segments stay clickable so removing one to
   *  make room still works. */
  canSelectMore?: boolean;
}) {
  // Selection is by cell, so the grid no longer has to decide which of several identical cells
  // gets to show a tick. It used to: selection was kept as colours, and at the extremes of
  // lightness several steps clamp to the same hex, so one selected colour matched several cells
  // and only the first was allowed to light up. Each cell now simply is or isn't selected.
  const columns = useMemo(
    () =>
      baseColors.map((base) => {
        try {
          return generateTintShadeScale(base, steps);
        } catch {
          return steps.map((step) => ({ step, hex: base }));
        }
      }),
    [baseColors, steps],
  );

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

      {/* One grid rather than a row of separate cards. The columns are steps of the same scheme
          and belong edge to edge: a gutter between them reads as three unrelated ramps, and it
          also puts the interface's own background between two colours that are being compared,
          which is the one thing a swatch should never have next to it. The rounding is the
          container's alone, and kept modest — the corner eats into the top and bottom steps of
          the outer columns, so every pixel of radius is a pixel of colour not shown. */}
      <div className="flex flex-1 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
        {columns.map((column, colIndex) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed column layout, columns never reorder within a render
            key={colIndex}
            className="flex flex-1 flex-col"
          >
            {column.map((cell, rowIndex) => {
              const step = steps[rowIndex];
              const hex = cell?.hex ?? baseColors[colIndex] ?? "#000000";
              const position = `${colIndex}:${step}`;
              const isSelected = selectedPositions?.includes(position) ?? false;
              const isDisabled =
                Boolean(onToggleColor) && !isSelected && !canSelectMore;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed column layout, columns never reorder within a render
                  key={`cell-${colIndex}-${step}`}
                  type="button"
                  onClick={
                    onToggleColor
                      ? () => onToggleColor(hex, position)
                      : undefined
                  }
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
