// Matches the strip's own height (h-8), so a segment never grows wider than it is tall. A real
// number rather than a Tailwind class because it has to be multiplied by the color count: the cap
// is on the strip as a whole, which is the only way to express it without asking the browser to
// size a flex container from children that have no intrinsic width of their own.
const SEGMENT_PX = 32;

/**
 * A live strip of the palette you're about to act on, sitting right next to the button that acts
 * on it — rather than a bare button with no preview of what it would do.
 *
 * Shared so that "here is your palette, here is what you can do with it" looks the same wherever
 * a palette gets assembled: built from a harmony, pulled out of an image, or scraped off a page.
 * Those arrive by very different routes and end in the same place.
 */
export function PalettePreviewBar({
  colors,
  actionLabel,
  onAction,
  title,
}: {
  colors: string[];
  actionLabel: string;
  onAction: () => void;
  title?: string;
}) {
  return (
    // Centred rather than spread: once the strip stops growing, the leftover width goes to the
    // sides instead of stranding the button at the far end of a wide panel.
    <div className="flex items-center justify-center gap-3 rounded-lg border border-black/10 p-2 dark:border-white/10">
      <div
        className="flex h-8 min-w-0 flex-1 overflow-hidden rounded-md border border-black/10 dark:border-white/10"
        // Grows to fill a narrow panel and stops at one square per color. Capping the strip and
        // letting the segments divide it keeps them able to shrink — sixteen colors still have to
        // fit a 380px side panel, where thin slivers beat a bar that overflows.
        style={{ maxWidth: colors.length * SEGMENT_PX }}
      >
        {colors.map((hex) => (
          <div
            key={hex}
            title={hex}
            className="min-w-0 flex-1"
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={colors.length === 0}
        title={title}
        className="shrink-0 cursor-pointer clay rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
      >
        {actionLabel}
      </button>
    </div>
  );
}
