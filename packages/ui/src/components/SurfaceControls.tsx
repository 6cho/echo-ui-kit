import { useDismissable } from "../lib/useDismissable";

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
// Departing from either is what the individual pickers are for.
export const SURFACE_PRESETS = {
  light: { backdrop: "#fafafa", foreground: "#ffffff" },
  dark: { backdrop: "#18181b", foreground: "#27272a" },
} as const;

export type SurfacePresetName = keyof typeof SURFACE_PRESETS;

/** One surface as a labelled row with its own dropdown. The trigger shows the current color and
 *  hex so the row reads correctly closed, which is most of the time. */
function SurfaceSection({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (hex: string) => void;
}) {
  const { isOpen, setIsOpen, ref } = useDismissable<HTMLDivElement>();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="relative shrink-0" ref={ref}>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-900 transition hover:bg-zinc-200 active:scale-95 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-100 dark:hover:bg-surface-hover"
        >
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-[11px]">{value}</span>
          <span className="text-[10px] text-zinc-500">▾</span>
        </button>

        {isOpen && (
          // Right-anchored because the trigger sits at the row's right edge and the popover is
          // wider than it; opening leftward is the only direction that stays on the panel.
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-black/10 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-surface-elevated">
            <div className="flex flex-wrap items-center gap-1.5">
              {options.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onChange(hex)}
                  title={hex}
                  style={{ backgroundColor: hex }}
                  className={`h-6 w-6 cursor-pointer rounded-md border transition active:scale-90 ${
                    value.toLowerCase() === hex.toLowerCase()
                      ? "border-brand-500 ring-2 ring-brand-500"
                      : "border-black/20 dark:border-white/20"
                  }`}
                />
              ))}
              <input
                type="color"
                aria-label={`${label} color`}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                title="Pick any color"
                className="h-6 w-6 shrink-0 cursor-pointer rounded-md border border-black/20 dark:border-white/20"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The backdrop and foreground the preview is staged against, plus a light/dark switch that sets
 * both at once. Shared because the surfaces are scenery for judging whatever is being designed,
 * not part of it — the same two controls apply whether you're shaping a corner or a shadow.
 */
export function SurfaceControls({
  backdrop,
  foreground,
  paletteColors,
  onBackdropChange,
  onForegroundChange,
}: {
  backdrop: string;
  foreground: string;
  /** Your own colors, offered alongside the neutrals so the preview can stand in for a real
   *  screen rather than a generic gray. */
  paletteColors: string[];
  onBackdropChange: (hex: string) => void;
  onForegroundChange: (hex: string) => void;
}) {
  const options = [
    ...new Set([
      ...SURFACE_COLORS,
      ...paletteColors.map((hex) => hex.toLowerCase()),
    ]),
  ];

  const activePreset = (
    Object.keys(SURFACE_PRESETS) as SurfacePresetName[]
  ).find(
    (key) =>
      SURFACE_PRESETS[key].backdrop === backdrop &&
      SURFACE_PRESETS[key].foreground === foreground,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 self-start rounded-md bg-zinc-100 p-0.5 dark:bg-surface-elevated">
        {(["light", "dark"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onBackdropChange(SURFACE_PRESETS[key].backdrop);
              onForegroundChange(SURFACE_PRESETS[key].foreground);
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
        value={backdrop}
        options={options}
        onChange={onBackdropChange}
      />
      <SurfaceSection
        label="Foreground"
        value={foreground}
        options={options}
        onChange={onForegroundChange}
      />
    </div>
  );
}
