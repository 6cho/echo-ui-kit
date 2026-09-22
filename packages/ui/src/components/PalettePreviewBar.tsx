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
    // Hugs its contents and centres, rather than stretching to whatever it is given. In a wide
    // panel a full-width bar turned a nine-color palette into nine long bands with the button
    // marooned at the far end; sized to fit, the strip and its button stay one object.
    <div className="mx-auto flex w-fit max-w-full items-center gap-3 rounded-lg border border-black/10 p-2 dark:border-white/10">
      <div className="flex h-8 min-w-0 w-fit max-w-full overflow-hidden rounded-md border border-black/10 dark:border-white/10">
        {colors.map((hex) => (
          <div
            key={hex}
            title={hex}
            // A square at rest: basis and max-width both match the strip's height, so a segment
            // grows no wider than it is tall. Shrinking is left alone — sixteen colors in a
            // side panel still have to fit, and thin slivers beat a bar that overflows.
            className="min-w-0 max-w-8 basis-8"
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={colors.length === 0}
        title={title}
        className="shrink-0 cursor-pointer rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
      >
        {actionLabel}
      </button>
    </div>
  );
}
