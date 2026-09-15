import { type CSSProperties, useState } from "react";

export function ColorSwatch({
  hex,
  label,
  onClick,
  showLabel = true,
  compact = false,
  selected = false,
  disabled = false,
  title,
  className,
}: {
  hex: string;
  label?: string;
  onClick?: () => void;
  /** Hides the hex/label footer — for dense grids where a row/column label already covers it. */
  showLabel?: boolean;
  /** Shorter swatch + tighter corners, for grids with many cells packed close together. */
  compact?: boolean;
  /** Marks this swatch as included in an active selection (e.g. the palette being built from
   *  grid clicks) — the border turns white instead of blending into the swatch's own color. */
  selected?: boolean;
  /** Renders as flat gray instead of its actual color, and non-interactive — e.g. a selection
   *  cap has been reached, so clicking this one wouldn't do anything until something else is
   *  deselected first. Gray (not just dimmed) so "disabled" reads unambiguously rather than
   *  looking like a slightly-faded version of the real color. */
  disabled?: boolean;
  /** Overrides the default hex/"Copied!" tooltip — e.g. to explain why a swatch is disabled. */
  title?: string;
  /** Extra classes appended to the button's own. Needed when this swatch isn't a direct CSS
   *  Grid item (which stretches to fill its column by default) but sits inside a wrapper div
   *  instead — e.g. for a padded gutter — since a nested flex box doesn't inherit that stretch
   *  and shrinks to near-nothing without an explicit width. */
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (onClick) {
      onClick();
      return;
    }
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) — the swatch still
      // shows the hex either way, so there's nothing to recover from here.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={title ?? (copied ? "Copied!" : hex)}
      // Border width is constant (border-2) regardless of `selected` — grid cells have no
      // explicit row height, so a width change here previously made selected cells taller than
      // their neighbors and threw off the whole row. The unselected color comes through a CSS
      // custom property (rather than a plain inline borderColor) specifically so the hover:
      // class below can still win — inline styles otherwise beat any stylesheet rule, hover
      // variants included. Disabled skips the custom property entirely (rather than trying to
      // override it with another utility class of equal specificity) so it always wins.
      style={
        selected || disabled
          ? undefined
          : ({ "--swatch-border": hex } as CSSProperties)
      }
      // active:scale on the outer button itself (border and inner fill both included), not an
      // inner span — scaling just an inner fill previously left the outer border-only button at
      // full size, exposing a black gap around the now-smaller fill. Scaling the whole element
      // together avoids that.
      className={`group flex flex-col overflow-hidden border-2 shadow-sm transition active:scale-95 ${compact ? "rounded-full" : "rounded-xl"} ${
        disabled
          ? "cursor-not-allowed border-zinc-300 dark:border-zinc-600"
          : selected
            ? "cursor-pointer border-white"
            : "cursor-pointer border-[var(--swatch-border)] hover:border-white/50"
      } ${className ?? ""}`}
    >
      <span
        // flex-1 (not a fixed height) so this fills the button completely even when CSS grid's
        // default align-items:stretch makes the button taller than this span's own min-height —
        // e.g. to match a step-label cell's line-height in the same row. A fixed height there
        // left a gap of transparent button background showing below the swatch. Disabled omits
        // the inline hex background so the gray utility class underneath shows instead — flat
        // gray, not a dimmed version of the real color, so "disabled" reads unambiguously.
        className={`relative w-full flex-1 ${compact ? "min-h-3" : "min-h-14"} ${disabled ? "bg-zinc-300 dark:bg-zinc-600" : ""}`}
        style={disabled ? undefined : { backgroundColor: hex }}
      >
        {copied && !showLabel && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 font-medium text-white text-xs">
            ✓
          </span>
        )}
      </span>
      {showLabel && (
        <span className="flex items-center justify-center bg-white px-1.5 py-1 font-mono text-[11px] text-zinc-600 dark:bg-surface-elevated dark:text-zinc-400">
          {copied ? "Copied!" : (label ?? hex)}
        </span>
      )}
    </button>
  );
}
