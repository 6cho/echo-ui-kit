// Matches the strip's own height (h-7) — see PalettePreviewBar for why this is a number.
const SEGMENT_PX = 28;

/**
 * A palette rendered as one continuous bar of segments, matching how saved palettes read in the
 * library.
 *
 * Replaces a wrapped grid of individual chips, which turned into a forty-swatch wall once a
 * palette and a set of neutrals were both on offer — visually loud, and it buried the controls
 * underneath it. A single strip reads as one object, takes one row whatever its length, and gets
 * the same treatment everywhere a color is picked.
 */
export function ColorStrip({
  label,
  colors,
  value,
  onChange,
}: {
  label?: string;
  colors: string[];
  value: string;
  onChange: (hex: string) => void;
}) {
  if (colors.length === 0) return null;

  return (
    // flex-1 so a strip sharing a row with the color picker claims the remaining width and the
    // picker stays pinned to the far end. Harmless in a column, where a flex child stretches
    // across regardless.
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {label && <span className="text-[11px] text-zinc-500">{label}</span>}
      {/* Capped at one square per color so the segments stop at square instead of spreading
          across a wide panel. The cap sits on the strip rather than on each segment, so they can
          still shrink below square when the panel is narrow. */}
      <div
        className="flex h-7 overflow-hidden rounded-md border border-black/10 dark:border-white/10"
        style={{ maxWidth: colors.length * SEGMENT_PX }}
      >
        {colors.map((hex, index) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: a segment is a position in the strip — the same hex can legitimately appear twice, and keying by it strands stale segments
            key={index}
            type="button"
            onClick={() => onChange(hex)}
            title={hex}
            style={{ backgroundColor: hex }}
            // Brightness on press, not active:scale — the segments sit flush against each other,
            // and scaling one down would open a gap its neighbours don't move to fill.
            className="relative min-w-0 flex-1 cursor-pointer transition hover:brightness-110 active:brightness-125"
          >
            {/* A ring here would draw a hard bar across the touching edges and break the
                continuous look. A small centred checkmark with its own drop shadow reads against
                any segment color without interrupting the seam. */}
            {value.toLowerCase() === hex.toLowerCase() && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3 drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.7)]"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
