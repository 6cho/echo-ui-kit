import type {
  OverlayOptions,
  PageColor,
  PageFont,
} from "@echo-ui-kit/adapters";
import { useEffect, useRef, useState } from "react";
import { usePageInspector } from "../context/PageContext";
import { Checkbox } from "./Checkbox";
import { CollapsibleSection } from "./CollapsibleSection";
import { PalettePreviewBar } from "./PalettePreviewBar";

const OVERLAY_TOGGLES: {
  key: keyof OverlayOptions;
  label: string;
  hint: string;
}[] = [
  {
    key: "outline",
    label: "Outline all",
    hint: "Every element outlined at once, color-coded by kind",
  },
  {
    key: "inspect",
    label: "Inspect on hover",
    hint: "Margin, border, padding, and content boxes for whatever you point at",
  },
];

const BAND_LEGEND = [
  { label: "Margin", color: "rgba(246, 178, 107, 0.9)" },
  { label: "Border", color: "rgba(253, 216, 137, 0.9)" },
  { label: "Padding", color: "rgba(147, 196, 125, 0.9)" },
  { label: "Content", color: "rgba(111, 168, 220, 0.9)" },
];

/**
 * The tools that act on the page you're looking at rather than on anything in the panel.
 *
 * These are the whole reason this is an extension: a hosted page can't reach into another
 * origin's DOM, so nothing here has a web-app equivalent. Everything runs on demand — the content
 * script sits idle until one of these buttons asks it something.
 */
export function PageToolsView({
  isActive = true,
  onUseColors,
}: {
  /** Whether this tool is the one on screen. The panel keeps every tool mounted so their state
   *  survives switching, which would otherwise mean re-scanning pages nobody is looking at. */
  isActive?: boolean;
  /** Hands extracted colors to the palette tool, which is the point of pulling them off a page
   *  in the first place. */
  onUseColors?: (hexes: string[]) => void;
}) {
  const inspector = usePageInspector();
  const [overlay, setOverlay] = useState<OverlayOptions>({
    outline: false,
    inspect: false,
  });
  const [colors, setColors] = useState<PageColor[] | null>(null);
  // Which of the scanned colors survive into the palette. A scan returns everything it found,
  // including the greys a page uses for borders and dividers — the interesting step is choosing
  // among them, so this mirrors how the palette tool works rather than taking all of them.
  const [keptHexes, setKeptHexes] = useState<string[]>([]);
  const [fonts, setFonts] = useState<PageFont[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(
    key: string,
    action: () => Promise<T>,
    onDone: (result: T) => void,
  ) {
    setBusy(key);
    setError(null);
    try {
      onDone(await action());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  }

  async function toggleOverlay(key: keyof OverlayOptions, next: boolean) {
    if (!inspector) return;
    const updated = { ...overlay, [key]: next };
    // Set optimistically so the checkbox tracks the click; a failure rolls it back below, which
    // beats a control that appears dead while the message round-trips.
    setOverlay(updated);
    setError(null);
    try {
      await inspector.setOverlay(updated);
    } catch (caught) {
      setOverlay(overlay);
      setError(caught instanceof Error ? caught.message : "That didn't work");
    }
  }

  // Read inside the refresh effect below, which must not re-subscribe every time the overlay
  // changes — a ref keeps the current value reachable without becoming a dependency.
  const overlayRef = useRef(overlay);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  /**
   * Brings the panel back in line with whatever page is now in front of it.
   *
   * Both halves matter. The scans are re-run because their results describe a document that no
   * longer exists. The overlays are re-applied because the content script died with that document
   * and took them with it — without this the checkboxes would stay ticked over a page with no
   * overlay on it, which is worse than them simply switching off.
   */
  useEffect(() => {
    if (!isActive || !inspector) return;

    let cancelled = false;
    async function refresh() {
      if (!inspector) return;
      try {
        const active = overlayRef.current;
        if (active.outline || active.inspect) {
          await inspector.setOverlay(active);
        }
        const [foundColors, foundFonts] = await Promise.all([
          inspector.extractColors(),
          inspector.extractFonts(),
        ]);
        if (cancelled) return;
        setColors(foundColors);
        setKeptHexes(foundColors.map((c) => c.hex));
        setFonts(foundFonts);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        // Surfaced rather than swallowed: navigating to a page that can't be inspected is the
        // usual cause, and saying so explains why the panel just emptied.
        setColors(null);
        setFonts(null);
        setKeptHexes([]);
        setOverlay({ outline: false, inspect: false });
        setError(caught instanceof Error ? caught.message : "That didn't work");
      }
    }

    refresh();
    const unsubscribe = inspector.onPageChange(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isActive, inspector]);

  function toggleColor(hex: string) {
    setKeptHexes((current) =>
      current.includes(hex)
        ? current.filter((h) => h !== hex)
        : // Reordered to match the scan order rather than appended, so re-adding a color puts it
          // back where it was instead of at the end of the strip.
          (colors ?? [])
            .map((c) => c.hex)
            .filter((h) => h === hex || current.includes(h)),
    );
  }

  // Below every hook, not above them: React requires the same hooks to run in the same order on
  // every render, and an early return before them would skip the ones that follow.
  if (!inspector) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Page tools need the extension
        </p>
        <p className="max-w-[220px] text-xs text-zinc-500">
          Inspecting a page means running inside it, which only the browser
          extension can do.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Box model
          </span>
          {/* Checkboxes rather than one segmented control: the two overlays answer different
              questions and compose usefully — outlines give you the page's structure while the
              inspector explains whatever you point at. */}
          {OVERLAY_TOGGLES.map(({ key, label, hint }) => (
            <div
              key={key}
              className="rounded-md border border-black/10 px-2.5 py-2 transition hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-surface-elevated"
            >
              <Checkbox
                checked={overlay[key]}
                onChange={(next) => toggleOverlay(key, next)}
                align="start"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {label}
                  </span>
                  <span className="text-[11px] leading-snug text-zinc-500">
                    {hint}
                  </span>
                </span>
              </Checkbox>
            </div>
          ))}

          {overlay.inspect && (
            <div className="flex flex-wrap gap-2">
              {BAND_LEGEND.map(({ label, color }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 text-[11px] text-zinc-500"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        <CollapsibleSection
          title="Colors"
          summary={colors ? `${colors.length} found` : "nothing yet"}
          defaultOpen
        >
          <button
            type="button"
            onClick={() =>
              run(
                "colors",
                () => inspector.extractColors(),
                (found) => {
                  setColors(found);
                  // Seeded with everything found rather than nothing, so a scan is immediately
                  // useful and narrowing is the optional step.
                  setKeptHexes(found.map((c) => c.hex));
                },
              )
            }
            disabled={busy === "colors"}
            className="cursor-pointer self-start rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "colors" ? "Scanning…" : "Rescan colors"}
          </button>

          {colors && colors.length > 0 && (
            <div className="flex flex-col gap-1">
              {colors.map((color) => {
                const kept = keptHexes.includes(color.hex);
                return (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => toggleColor(color.hex)}
                    title={
                      kept ? "Leave out of the palette" : "Add to the palette"
                    }
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-left transition active:scale-[0.99] ${
                      kept
                        ? "border-black/10 dark:border-white/10"
                        : "border-transparent opacity-40 hover:opacity-70"
                    }`}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/10"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                      {color.hex}
                    </span>
                    <span className="ml-auto truncate text-[11px] text-zinc-500">
                      {`${color.usage}× · ${color.sources.join(", ")}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {colors && colors.length === 0 && (
            <p className="text-[11px] text-zinc-500">
              Nothing repeated often enough to count as part of the design.
            </p>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Fonts"
          summary={fonts ? `${fonts.length} found` : "nothing yet"}
        >
          <button
            type="button"
            onClick={() =>
              run("fonts", () => inspector.extractFonts(), setFonts)
            }
            disabled={busy === "fonts"}
            className="cursor-pointer self-start rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "fonts" ? "Scanning…" : "Rescan fonts"}
          </button>

          {fonts?.map((font) => (
            <div
              key={font.family}
              className="flex flex-col gap-0.5 rounded-md border border-black/10 px-2 py-1.5 dark:border-white/10"
            >
              <div className="flex items-baseline justify-between gap-2">
                {/* Rendered in the font itself where the machine has it — the fastest way to tell
                  whether a stack is actually resolving to what the page intended. */}
                <span
                  className="truncate text-xs text-zinc-800 dark:text-zinc-200"
                  style={{ fontFamily: font.family }}
                >
                  {font.family}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-zinc-500">
                  {`${font.usage}×`}
                </span>
              </div>
              <span className="truncate font-mono text-[11px] text-zinc-500">
                {`${font.sizes.slice(0, 6).join("/")}px · ${font.weights.join("/")}`}
              </span>
            </div>
          ))}
        </CollapsibleSection>
      </div>

      {/* Pinned below the scroll region, exactly as the palette tool's is — the palette you're
          assembling shouldn't scroll away from the button that uses it. */}
      {keptHexes.length > 0 && onUseColors && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-black/10 p-4 dark:border-white/10">
          <PalettePreviewBar
            colors={keptHexes}
            actionLabel="Use as palette"
            onAction={() => onUseColors(keptHexes)}
            title="Open these colors in the palette tool"
          />
        </div>
      )}
    </div>
  );
}
