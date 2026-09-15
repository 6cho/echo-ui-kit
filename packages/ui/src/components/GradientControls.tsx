import {
  GRADIENT_TYPES,
  type Gradient,
  type GradientStop,
} from "@echo-ui-kit/tools-core";
import { useState } from "react";
import { Slider } from "./Slider";
import { ThreeDotMenu } from "./ThreeDotMenu";

// Below two stops there's no gradient left to look at, so the last pair can't be removed.
const MIN_STOPS = 2;

export const DEFAULT_GRADIENT: Gradient = {
  type: "linear",
  angle: 135,
  stops: [
    { color: "#3b82f6", position: 0 },
    { color: "#8b5cf6", position: 100 },
  ],
};

/**
 * Type, angle, and the stop list for one gradient. Extracted so the standalone gradient tool and
 * the box editor's two surfaces drive the same editor — a gradient is a gradient wherever it
 * ends up, and three near-copies would drift apart on the first change to any of them.
 *
 * Owns which stop is selected, because that's transient UI state with no meaning outside these
 * controls; the gradient itself is the caller's.
 */
export function GradientControls({
  gradient,
  paletteColors,
  onChange,
}: {
  gradient: Gradient;
  paletteColors: string[];
  onChange: (gradient: Gradient) => void;
}) {
  const [selectedStop, setSelectedStop] = useState(0);
  const stop =
    gradient.stops[selectedStop] ?? (gradient.stops[0] as GradientStop);

  function updateStop(patch: Partial<GradientStop>) {
    onChange({
      ...gradient,
      stops: gradient.stops.map((s, i) =>
        i === selectedStop ? { ...s, ...patch } : s,
      ),
    });
  }

  function addStop() {
    // Lands midway between the selected stop and whichever stop sits next along the gradient, so
    // a new stop is always somewhere visible rather than stacked exactly on an existing one.
    // Falling back to 100 covers adding from the last stop, where there's no next one.
    const laterPositions = gradient.stops
      .map((s) => s.position)
      .filter((position) => position > stop.position);
    const nextPosition =
      laterPositions.length > 0 ? Math.min(...laterPositions) : 100;
    onChange({
      ...gradient,
      stops: [
        ...gradient.stops,
        {
          color: stop.color,
          position: Math.round((stop.position + nextPosition) / 2),
        },
      ],
    });
    setSelectedStop(gradient.stops.length);
  }

  function removeStop() {
    if (gradient.stops.length <= MIN_STOPS) return;
    onChange({
      ...gradient,
      stops: gradient.stops.filter((_, i) => i !== selectedStop),
    });
    setSelectedStop((i) => Math.max(0, i - 1));
  }

  const colorOptions = [
    ...new Set([
      stop.color.toLowerCase(),
      ...paletteColors.map((hex) => hex.toLowerCase()),
    ]),
  ];

  return (
    <>
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-surface-elevated">
        {GRADIENT_TYPES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ ...gradient, type: id })}
            className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition active:scale-95 ${
              gradient.type === id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Radial has no direction to set, so the control disappears rather than sitting there
          inert — the angle itself is kept in the value so switching back restores it. */}
      {gradient.type !== "radial" && (
        <Slider
          label="Angle"
          value={gradient.angle}
          min={0}
          max={360}
          step={1}
          displayValue={`${gradient.angle}°`}
          onChange={(angle) => onChange({ ...gradient, angle })}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {`Stops (${gradient.stops.length})`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={addStop}
            className="cursor-pointer rounded-md border border-black/10 px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
          >
            Add stop
          </button>
          {gradient.stops.length > MIN_STOPS && (
            <ThreeDotMenu
              items={[
                {
                  label: "Delete stop",
                  onSelect: removeStop,
                  destructive: true,
                },
              ]}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {gradient.stops.map((s, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: a stop has no identity beyond its slot in the list, and two can legitimately share a color and position
            key={`stop-${i}`}
            type="button"
            onClick={() => setSelectedStop(i)}
            title={`${s.color} at ${Math.round(s.position)}%`}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition active:scale-95 ${
              i === selectedStop
                ? "border-brand-500 text-brand-600 dark:text-brand-500"
                : "border-black/10 text-zinc-500 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-surface-elevated"
            }`}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-black/20 dark:border-white/20"
              style={{ backgroundColor: s.color }}
            />
            {`${Math.round(s.position)}%`}
          </button>
        ))}
      </div>

      <Slider
        label={`Stop ${selectedStop + 1} position`}
        value={Math.round(stop.position)}
        min={0}
        max={100}
        step={1}
        displayValue={`${Math.round(stop.position)}%`}
        thumbColor={stop.color}
        onChange={(position) => updateStop({ position })}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {colorOptions.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => updateStop({ color: hex })}
            title={hex}
            style={{ backgroundColor: hex }}
            className={`h-6 w-6 cursor-pointer rounded-md border transition active:scale-90 ${
              stop.color.toLowerCase() === hex
                ? "border-brand-500 ring-2 ring-brand-500"
                : "border-black/20 dark:border-white/20"
            }`}
          />
        ))}
        <input
          type="color"
          aria-label="Stop color"
          value={stop.color}
          onChange={(e) => updateStop({ color: e.target.value })}
          title="Pick any color"
          className="h-6 w-6 shrink-0 cursor-pointer rounded-md border border-black/20 dark:border-white/20"
        />
      </div>
    </>
  );
}
