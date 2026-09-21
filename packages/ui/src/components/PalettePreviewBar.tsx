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
    <div className="flex items-center gap-3 rounded-lg border border-black/10 p-2 dark:border-white/10">
      <div className="flex h-8 flex-1 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
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
        className="shrink-0 cursor-pointer rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
      >
        {actionLabel}
      </button>
    </div>
  );
}
