import {
  describeFill,
  type Fill,
  fillPreviewColor,
  formatFill,
  solidFill,
} from "@echo-ui-kit/tools-core";
import { CollapsibleSection } from "./CollapsibleSection";
import { ColorStrip } from "./ColorStrip";
import { DEFAULT_GRADIENT, GradientControls } from "./GradientControls";

// A neutral ramp spanning white to near-black, so the preview can be set up to match wherever the
// thing being designed will actually live. A shadow tuned on white can vanish entirely on a dark
// surface, which is the single easiest way to ship one that looks broken.
const SURFACE_COLORS = [
  "#ffffff",
  "#f4f4f5",
  "#e4e4e7",
  "#a1a1aa",
  "#3f3f46",
  "#18181b",
];

// The two setups worth one click, since almost every element is destined for one or the other.
// Departing from either is what the individual sections are for.
export const SURFACE_PRESETS = {
  light: { backdrop: "#fafafa", foreground: "#ffffff" },
  dark: { backdrop: "#18181b", foreground: "#27272a" },
} as const;

export type SurfacePresetName = keyof typeof SURFACE_PRESETS;

/** One surface as its own section: solid or gradient, with the current value on the header so it
 *  reads correctly collapsed — which is most of the time. */
function SurfaceSection({
  label,
  fill,
  paletteColors,
  onChange,
  enabled,
  onEnabledChange,
}: {
  label: string;
  fill: Fill;
  paletteColors: string[];
  onChange: (fill: Fill) => void;
  enabled?: boolean;
  onEnabledChange?: (next: boolean) => void;
}) {
  const palette = [...new Set(paletteColors.map((hex) => hex.toLowerCase()))];

  return (
    <CollapsibleSection
      title={label}
      summary={describeFill(fill)}
      enabled={enabled}
      onToggle={onEnabledChange}
    >
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-md bg-zinc-100 p-0.5 dark:bg-surface-elevated">
          {(["solid", "gradient"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() =>
                onChange(
                  kind === "solid"
                    ? // Seeded from the gradient's own first stop rather than a fixed default, so
                      // switching back and forth doesn't discard the color you'd settled on.
                      solidFill(fillPreviewColor(fill))
                    : {
                        kind: "gradient",
                        gradient: {
                          ...DEFAULT_GRADIENT,
                          stops: [
                            { color: fillPreviewColor(fill), position: 0 },
                            { color: "#8b5cf6", position: 100 },
                          ],
                        },
                      },
                )
              }
              className={`flex-1 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium capitalize transition active:scale-95 ${
                fill.kind === kind
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {kind}
            </button>
          ))}
        </div>
        <span
          className="h-6 w-10 shrink-0 rounded-md border border-black/20 dark:border-white/20"
          style={{ background: formatFill(fill) }}
        />
      </div>

      {fill.kind === "solid" ? (
        <>
          <ColorStrip
            label="Palette"
            colors={palette}
            value={fill.color}
            onChange={(hex) => onChange(solidFill(hex))}
          />
          <div className="flex items-end gap-2">
            <ColorStrip
              label="Neutrals"
              colors={SURFACE_COLORS}
              value={fill.color}
              onChange={(hex) => onChange(solidFill(hex))}
            />
            <input
              type="color"
              aria-label={`${label} color`}
              value={fill.color}
              onChange={(e) => onChange(solidFill(e.target.value))}
              title="Pick any color"
              className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-black/20 dark:border-white/20"
            />
          </div>
        </>
      ) : (
        <GradientControls
          gradient={fill.gradient}
          paletteColors={paletteColors}
          onChange={(gradient) => onChange({ kind: "gradient", gradient })}
        />
      )}
    </CollapsibleSection>
  );
}

/**
 * The backdrop and foreground the preview is staged against. Each can be a solid color or a
 * gradient, because CSS takes either in the same `background` slot and a card with a gradient
 * fill is an ordinary thing to be designing.
 *
 * The light/dark switch sets both to solids at once, which is the common case; the sections below
 * it are for departing from that.
 */
export function SurfaceControls({
  backdrop,
  foreground,
  paletteColors,
  onBackdropChange,
  onForegroundChange,
  foregroundEnabled,
  onForegroundEnabledChange,
}: {
  backdrop: Fill;
  foreground: Fill;
  /** Your own colors, offered alongside the neutrals so the preview can stand in for a real
   *  screen rather than a generic gray. */
  paletteColors: string[];
  onBackdropChange: (fill: Fill) => void;
  onForegroundChange: (fill: Fill) => void;
  /** Whether the element's own background is emitted at all. The backdrop has no switch — it's
   *  the surface being designed against, not a property of the element. */
  foregroundEnabled?: boolean;
  onForegroundEnabledChange?: (next: boolean) => void;
}) {
  const activePreset = (
    Object.keys(SURFACE_PRESETS) as SurfacePresetName[]
  ).find(
    (key) =>
      backdrop.kind === "solid" &&
      foreground.kind === "solid" &&
      SURFACE_PRESETS[key].backdrop === backdrop.color &&
      SURFACE_PRESETS[key].foreground === foreground.color,
  );

  return (
    <>
      <div className="flex gap-1 self-start rounded-md bg-zinc-100 p-0.5 dark:bg-surface-elevated">
        {(["light", "dark"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onBackdropChange(solidFill(SURFACE_PRESETS[key].backdrop));
              onForegroundChange(solidFill(SURFACE_PRESETS[key].foreground));
            }}
            className={`cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium capitalize transition active:scale-95 ${
              activePreset === key
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <SurfaceSection
        label="Backdrop"
        fill={backdrop}
        paletteColors={paletteColors}
        onChange={onBackdropChange}
      />
      <SurfaceSection
        label="Foreground"
        fill={foreground}
        paletteColors={paletteColors}
        onChange={onForegroundChange}
        enabled={foregroundEnabled}
        onEnabledChange={onForegroundEnabledChange}
      />
    </>
  );
}
