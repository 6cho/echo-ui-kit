import {
  formatGradient,
  formatGradientCss,
  GRADIENT_TYPES,
  type Gradient,
  type GradientStop,
} from "@echo-ui-kit/tools-core";
import { useMemo, useState } from "react";
import { CssOutput } from "./CssOutput";
import { Slider } from "./Slider";
import { ThreeDotMenu } from "./ThreeDotMenu";

const DEFAULT_GRADIENT: Gradient = {
  type: "linear",
  angle: 135,
  stops: [
    { color: "#3b82f6", position: 0 },
    { color: "#8b5cf6", position: 100 },
  ],
};

// Below two stops there's no gradient left to look at, so the last pair can't be removed.
const MIN_STOPS = 2;

export function GradientGenerator({
  paletteColors,
}: {
  paletteColors: string[];
}) {
  const [gradient, setGradient] = useState<Gradient>(DEFAULT_GRADIENT);
  const [selectedStop, setSelectedStop] = useState(0);

  const value = useMemo(() => formatGradient(gradient), [gradient]);
  const css = useMemo(() => formatGradientCss(gradient), [gradient]);

  const stop =
    gradient.stops[selectedStop] ?? (gradient.stops[0] as GradientStop);

  function updateStop(patch: Partial<GradientStop>) {
    setGradient((current) => ({
      ...current,
      stops: current.stops.map((s, i) =>
        i === selectedStop ? { ...s, ...patch } : s,
      ),
    }));
  }

  function addStop() {
    const selected = gradient.stops[selectedStop];
    if (!selected) return;
    // Lands midway between the selected stop and whichever stop sits next along the gradient, so
    // a new stop is always somewhere visible rather than stacked exactly on an existing one.
    // Falling back to 100 covers adding from the last stop, where there's no next one.
    const laterPositions = gradient.stops
      .map((s) => s.position)
      .filter((position) => position > selected.position);
    const nextPosition =
      laterPositions.length > 0 ? Math.min(...laterPositions) : 100;
    setGradient((current) => ({
      ...current,
      stops: [
        ...current.stops,
        {
          color: selected.color,
          position: Math.round((selected.position + nextPosition) / 2),
        },
      ],
    }));
    setSelectedStop(gradient.stops.length);
  }

  function removeStop() {
    if (gradient.stops.length <= MIN_STOPS) return;
    setGradient((current) => ({
      ...current,
      stops: current.stops.filter((_, i) => i !== selectedStop),
    }));
    setSelectedStop((i) => Math.max(0, i - 1));
  }

  const colorOptions = [
    ...new Set([
      stop.color.toLowerCase(),
      ...paletteColors.map((hex) => hex.toLowerCase()),
    ]),
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div
        className="h-40 rounded-lg border border-black/10 dark:border-white/10"
        style={{ background: value }}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Type
        </span>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-surface-elevated">
          {GRADIENT_TYPES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setGradient((c) => ({ ...c, type: id }))}
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
      </div>

      {/* Radial has no direction to set, so the control disappears rather than sitting there
          inert — the angle itself is kept in state so switching back restores it. */}
      {gradient.type !== "radial" && (
        <Slider
          label="Angle"
          value={gradient.angle}
          min={0}
          max={360}
          step={1}
          displayValue={`${gradient.angle}°`}
          onChange={(angle) => setGradient((c) => ({ ...c, angle }))}
        />
      )}

      <div className="flex flex-col gap-1.5">
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
      </div>

      <div className="flex flex-col gap-2.5 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {`Stop ${selectedStop + 1} of ${gradient.stops.length}`}
        </span>
        <Slider
          label="Position"
          value={Math.round(stop.position)}
          min={0}
          max={100}
          step={1}
          displayValue={`${Math.round(stop.position)}%`}
          thumbColor={stop.color}
          onChange={(position) => updateStop({ position })}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Color
          </span>
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
        </div>
      </div>

      <CssOutput code={css} />
    </div>
  );
}
