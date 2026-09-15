import {
  formatRadius,
  formatRadiusCss,
  RADIUS_CORNER_KEYS,
  RADIUS_CORNER_LABELS,
  type RadiusCorners,
  type RadiusUnit,
} from "@echo-ui-kit/tools-core";
import { useMemo, useState } from "react";
import { CssOutput } from "./CssOutput";
import { Slider } from "./Slider";

const MAX_PX = 100;
const MAX_PERCENT = 50;

const DEFAULT_CORNERS: RadiusCorners = {
  topLeft: 12,
  topRight: 12,
  bottomRight: 12,
  bottomLeft: 12,
};

export function RadiusPlayground() {
  const [corners, setCorners] = useState<RadiusCorners>(DEFAULT_CORNERS);
  const [unit, setUnit] = useState<RadiusUnit>("px");
  const [linked, setLinked] = useState(true);

  const value = useMemo(() => formatRadius(corners, unit), [corners, unit]);
  const css = useMemo(() => formatRadiusCss(corners, unit), [corners, unit]);
  const max = unit === "px" ? MAX_PX : MAX_PERCENT;

  function updateCorner(key: keyof RadiusCorners, next: number) {
    setCorners((current) =>
      linked
        ? { topLeft: next, topRight: next, bottomRight: next, bottomLeft: next }
        : { ...current, [key]: next },
    );
  }

  function changeUnit(nextUnit: RadiusUnit) {
    // Clamps on the way over, because the two units have different ceilings — a 100px corner
    // carried straight into percent mode would be past the 50% limit and stick at the end of
    // every slider until you noticed.
    const nextMax = nextUnit === "px" ? MAX_PX : MAX_PERCENT;
    setCorners((current) => ({
      topLeft: Math.min(current.topLeft, nextMax),
      topRight: Math.min(current.topRight, nextMax),
      bottomRight: Math.min(current.bottomRight, nextMax),
      bottomLeft: Math.min(current.bottomLeft, nextMax),
    }));
    setUnit(nextUnit);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex h-44 items-center justify-center rounded-lg border border-black/10 bg-zinc-100 dark:border-white/10 dark:bg-surface-elevated">
        <div
          className="h-28 w-40 bg-brand-500"
          style={{ borderRadius: value }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5 dark:bg-surface-elevated">
          {(["px", "%"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => changeUnit(id)}
              className={`cursor-pointer rounded px-2.5 py-0.5 text-[11px] font-medium transition active:scale-95 ${
                unit === id
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={linked}
            onChange={(e) => setLinked(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
          />
          <span className="text-xs text-zinc-700 dark:text-zinc-300">
            Link corners
          </span>
        </label>
      </div>

      {/* Linked mode shows one slider rather than four that move in lockstep — four identical
          sliders sliding together is noise, and it isn't obvious they're linked rather than
          broken. */}
      <div className="flex flex-col gap-2.5">
        {linked ? (
          <Slider
            label="All corners"
            value={corners.topLeft}
            min={0}
            max={max}
            step={1}
            displayValue={`${corners.topLeft}${unit}`}
            onChange={(next) => updateCorner("topLeft", next)}
          />
        ) : (
          RADIUS_CORNER_KEYS.map((key) => (
            <Slider
              key={key}
              label={RADIUS_CORNER_LABELS[key]}
              value={corners[key]}
              min={0}
              max={max}
              step={1}
              displayValue={`${corners[key]}${unit}`}
              onChange={(next) => updateCorner(key, next)}
            />
          ))
        )}
      </div>

      <CssOutput code={css} />
    </div>
  );
}
