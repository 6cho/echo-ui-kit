import type { Theme } from "../lib/theme";
import { useDismissable } from "../lib/useDismissable";

const MODES: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

/**
 * Everything about how the app looks, behind one icon.
 *
 * These were two controls in the header — a sun/moon switch and a palette pill — which is two of
 * the header's limited width spent on a thing nobody adjusts twice in a session, sitting next to
 * the thing they came here to use. A half-filled circle is the usual glyph for appearance, and it
 * happens to say both halves of what is in here: which way round the interface is, and what
 * colour it is.
 */
export function ThemeMenu({
  theme,
  onThemeChange,
  paletteColors,
  isPaletteApplied,
  onPaletteAppliedChange,
}: {
  theme: Theme;
  onThemeChange: (next: Theme) => void;
  paletteColors: string[];
  isPaletteApplied: boolean;
  onPaletteAppliedChange: (next: boolean) => void;
}) {
  const { isOpen, setIsOpen, ref } = useDismissable<HTMLDivElement>();
  const preview = paletteColors.slice(0, 8);
  const hasPalette = preview.length > 0;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        title="Theme"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Theme settings"
        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition active:scale-95 ${
          isOpen
            ? "border-brand-500 text-brand-600 dark:text-brand-400"
            : "border-black/10 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
        }`}
      >
        {/* Half light, half dark, and filled from the palette when the palette is what's
            painting it — the icon states what the menu behind it is currently doing. */}
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
        </svg>
      </button>

      {isOpen && (
        <div
          // Right-anchored: the trigger sits at the right edge of the app header, so a menu
          // wider than it has to grow inward or it goes off the window.
          className="clay absolute right-0 z-30 mt-1.5 flex w-60 flex-col gap-3 rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-surface-elevated"
        >
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-[10px] text-zinc-400 uppercase tracking-wide dark:text-zinc-500">
              Appearance
            </span>
            <div className="clay-inset flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-surface">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onThemeChange(mode.id)}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 font-medium text-xs transition active:scale-95 ${
                    theme === mode.id
                      ? "clay bg-white text-zinc-900 dark:bg-zinc-700 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  {mode.id === "light" ? <SunIcon /> : <MoonIcon />}
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-[10px] text-zinc-400 uppercase tracking-wide dark:text-zinc-500">
              Colour
            </span>
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs text-zinc-700 dark:text-zinc-300">
                  Use my palette
                </span>
                <span className="flex h-3.5 w-full overflow-hidden rounded-full border border-black/10 dark:border-white/10">
                  {hasPalette ? (
                    preview.map((hex, index) => (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: a segment is a position in the strip — the same hex can legitimately appear twice, and keying by it strands stale segments
                        key={index}
                        className={`min-w-0 flex-1 transition ${
                          isPaletteApplied ? "" : "grayscale"
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))
                  ) : (
                    <span className="flex-1 bg-zinc-200 dark:bg-surface-hover" />
                  )}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPaletteApplied}
                aria-label="Theme the app with my palette"
                disabled={!hasPalette}
                onClick={() => onPaletteAppliedChange(!isPaletteApplied)}
                className={`relative h-4 w-7 shrink-0 cursor-pointer rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isPaletteApplied
                    ? "bg-brand-600"
                    : "bg-zinc-300 dark:bg-zinc-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
                    isPaletteApplied ? "left-3.5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <span className="text-[11px] text-zinc-500">
              {hasPalette
                ? "Recolours the whole app from the palette you're building."
                : "Build a palette and it can recolour the app."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
