import type { OverlayMode, PageColor, PageFont } from "@echo-ui-kit/adapters";
import { useState } from "react";
import { usePageInspector } from "../context/PageContext";
import { CollapsibleSection } from "./CollapsibleSection";

const OVERLAY_MODES: { id: OverlayMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "No overlay on the page" },
  {
    id: "outline",
    label: "Outline all",
    hint: "Outlines every element at once, color-coded by kind",
  },
  {
    id: "inspect",
    label: "Inspect",
    hint: "Hover an element for its margin, border, padding, and content boxes",
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
  onUseColors,
}: {
  /** Hands extracted colors to the palette tool, which is the point of pulling them off a page
   *  in the first place. */
  onUseColors?: (hexes: string[]) => void;
}) {
  const inspector = usePageInspector();
  const [overlay, setOverlay] = useState<OverlayMode>("off");
  const [colors, setColors] = useState<PageColor[] | null>(null);
  const [fonts, setFonts] = useState<PageFont[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function changeOverlay(mode: OverlayMode) {
    if (!inspector) return;
    // Set optimistically so the segmented control tracks the click; a failure resets it below,
    // which is better than a control that appears dead while the message round-trips.
    setOverlay(mode);
    setError(null);
    try {
      await inspector.setOverlay(mode);
    } catch (caught) {
      setOverlay("off");
      setError(caught instanceof Error ? caught.message : "That didn't work");
    }
  }

  const activeHint = OVERLAY_MODES.find((m) => m.id === overlay)?.hint;

  return (
    <div className="flex flex-col gap-4 p-4">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Box model
        </span>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-surface-elevated">
          {OVERLAY_MODES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => changeOverlay(id)}
              className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition active:scale-95 ${
                overlay === id
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">{activeHint}</p>

        {overlay === "inspect" && (
          <div className="flex flex-wrap gap-2 pt-1">
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
        summary={colors ? `${colors.length} found` : "not scanned"}
        defaultOpen
      >
        <button
          type="button"
          onClick={() =>
            run("colors", () => inspector.extractColors(), setColors)
          }
          disabled={busy === "colors"}
          className="cursor-pointer self-start rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "colors" ? "Scanning…" : "Scan page colors"}
        </button>

        {colors && colors.length > 0 && (
          <>
            <div className="flex h-7 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
              {colors.map((color) => (
                <div
                  key={color.hex}
                  title={`${color.hex} · ${color.usage} uses · ${color.sources.join(", ")}`}
                  className="min-w-0 flex-1"
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
            {onUseColors && (
              <button
                type="button"
                onClick={() => onUseColors(colors.map((c) => c.hex))}
                className="cursor-pointer self-start rounded-md border border-black/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
              >
                Use as palette
              </button>
            )}
            <div className="flex flex-col gap-1">
              {colors.slice(0, 8).map((color) => (
                <div
                  key={color.hex}
                  className="flex items-center gap-2 rounded-md border border-black/10 px-2 py-1 dark:border-white/10"
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
                </div>
              ))}
            </div>
          </>
        )}
        {colors && colors.length === 0 && (
          <p className="text-[11px] text-zinc-500">
            Nothing repeated often enough to count as part of the design.
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Fonts"
        summary={fonts ? `${fonts.length} found` : "not scanned"}
      >
        <button
          type="button"
          onClick={() => run("fonts", () => inspector.extractFonts(), setFonts)}
          disabled={busy === "fonts"}
          className="cursor-pointer self-start rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "fonts" ? "Scanning…" : "Scan page fonts"}
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
  );
}
