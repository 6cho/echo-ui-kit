/**
 * The app-wide state of the palette, in the global header.
 *
 * A palette in this app is already shared across tools — contrast, export and theme all read the
 * one being built. This says so, by showing it in the one place that belongs to no tool, and lets
 * it go one step further: applied here, it recolours the interface around it.
 *
 * Greyscale when off. The swatches stay in place either way, so the button reads as "your palette,
 * currently not in use" rather than as an unrelated control that happens to be coloured.
 */
export function AppThemeToggle({
  colors,
  enabled,
  onToggle,
}: {
  colors: string[];
  enabled: boolean;
  onToggle: () => void;
}) {
  const preview = colors.slice(0, 6);
  const hasPalette = preview.length > 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!hasPalette}
      aria-pressed={enabled}
      title={
        hasPalette
          ? enabled
            ? "Your palette is theming the app — click to go back to the default"
            : "Theme the whole app with your palette"
          : "Build a palette to theme the app with it"
      }
      className={`flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-1.5 font-medium text-[11px] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
        enabled
          ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400"
          : "border-black/10 text-zinc-500 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-surface-elevated"
      }`}
    >
      <span className="flex h-3.5 w-9 shrink-0 overflow-hidden rounded-full border border-black/10 dark:border-white/10">
        {hasPalette ? (
          preview.map((hex) => (
            <span
              key={hex}
              className={`min-w-0 flex-1 transition ${enabled ? "" : "grayscale"}`}
              style={{ backgroundColor: hex }}
            />
          ))
        ) : (
          <span className="flex-1 bg-zinc-200 dark:bg-surface-hover" />
        )}
      </span>
      App theme
    </button>
  );
}
