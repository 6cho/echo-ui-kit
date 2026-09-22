import type { CSSProperties } from "react";

// A plain neutral track for sliders whose value isn't a color — the palette's HSL sliders pass a
// real gradient instead, so their track previews what dragging would actually produce.
const DEFAULT_TRACK = "linear-gradient(currentColor, currentColor)";
const DEFAULT_THUMB_COLOR = "#ffffff";

/**
 * One labeled range input. `trackBackground` is a caller-supplied gradient so a slider whose
 * value *is* a color can preview what dragging it would produce (a full rainbow for hue;
 * gray-to-vivid at the current hue for saturation) rather than showing a generic flat bar.
 *
 * `thumbColor` makes the handle read as one of the color wheel's own markers — same size
 * (h-3.5 w-3.5), same thin translucent ring, same shadow — filled with whatever color the slider
 * currently resolves to. Reaching the thumb's `::-webkit-slider-thumb`/`::-moz-range-thumb`
 * pseudo-elements with a JS-computed value needs a CSS custom property: a plain inline `style`
 * prop can't target a pseudo-element directly, but a custom property still inherits through to
 * one. Same technique ColorSwatch uses for its own unselected border color.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  trackBackground = DEFAULT_TRACK,
  thumbColor = DEFAULT_THUMB_COLOR,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  trackBackground?: string;
  thumbColor?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-zinc-400">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{label}</span>
        <span className="font-mono text-[11px] text-zinc-500">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            // Handed over as custom properties rather than set as `background` here, because the
            // track has to differ by theme and an inline style can't express that — it would
            // also outrank any stylesheet rule trying to. The actual track is composed in
            // theme.css, which can see whether dark mode is on.
            "--slider-track": trackBackground,
            "--slider-thumb-color": thumbColor,
          } as CSSProperties
        }
        className="h-0.5 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white/60 [&::-moz-range-thumb]:bg-[var(--slider-thumb-color)] [&::-moz-range-thumb]:shadow-sm [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/60 [&::-webkit-slider-thumb]:bg-[var(--slider-thumb-color)] [&::-webkit-slider-thumb]:shadow-sm"
      />
    </div>
  );
}
