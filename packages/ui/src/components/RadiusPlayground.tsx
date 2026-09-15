import {
  formatRadius,
  formatRadiusCss,
  RADIUS_CORNER_KEYS,
  RADIUS_CORNER_LABELS,
  type RadiusCorners,
  type RadiusUnit,
} from "@echo-ui-kit/tools-core";
import { useMemo, useRef, useState } from "react";
import { CssOutput } from "./CssOutput";
import { Slider } from "./Slider";

const MAX_PX = 100;
const MAX_PERCENT = 50;

// Fixed rather than fluid so handle positions can be computed straight from the radius without
// measuring first. The drag math still reads the live rect, so this stays correct even if the
// box is ever scaled by a parent.
const BOX_WIDTH = 180;
const BOX_HEIGHT = 128;

const DEFAULT_CORNERS: RadiusCorners = {
  topLeft: 12,
  topRight: 12,
  bottomRight: 12,
  bottomLeft: 12,
};

const RIGHT_CORNERS: (keyof RadiusCorners)[] = ["topRight", "bottomRight"];
const BOTTOM_CORNERS: (keyof RadiusCorners)[] = ["bottomRight", "bottomLeft"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function RadiusPlayground() {
  const [corners, setCorners] = useState<RadiusCorners>(DEFAULT_CORNERS);
  const [unit, setUnit] = useState<RadiusUnit>("px");
  const [linked, setLinked] = useState(true);

  const boxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<keyof RadiusCorners | null>(null);

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

  /** Where a corner's arc meets its horizontal edge — which is where the handle sits, and the
   *  distance the drag reads back. */
  function handleOffsetPx(key: keyof RadiusCorners): number {
    const raw = unit === "px" ? corners[key] : (corners[key] / 100) * BOX_WIDTH;
    return clamp(raw, 0, BOX_WIDTH / 2);
  }

  function radiusFromPointer(
    key: keyof RadiusCorners,
    clientX: number,
  ): number | null {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    // Distance from *this corner's* side, so both left and right handles move outward-to-inward
    // in the direction you'd expect rather than one of them running backwards.
    const fromEdge = RIGHT_CORNERS.includes(key)
      ? rect.right - clientX
      : clientX - rect.left;
    // Capped at the midpoint: past it the handle would cross onto the opposite corner's half of
    // the edge, and CSS would be clamping the rendered radius anyway.
    const px = clamp(fromEdge, 0, rect.width / 2);
    return unit === "px"
      ? Math.round(clamp(px, 0, MAX_PX))
      : Math.round(clamp((px / rect.width) * 100, 0, MAX_PERCENT));
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex h-48 items-center justify-center rounded-lg border border-black/10 bg-zinc-100 dark:border-white/10 dark:bg-surface-elevated">
        <div
          ref={boxRef}
          className="relative touch-none select-none"
          style={{ width: BOX_WIDTH, height: BOX_HEIGHT }}
          onPointerMove={(e) => {
            const key = draggingRef.current;
            if (!key) return;
            const next = radiusFromPointer(key, e.clientX);
            if (next !== null) updateCorner(key, next);
          }}
          onPointerUp={(e) => {
            draggingRef.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          <div
            className="h-full w-full bg-brand-500"
            style={{ borderRadius: value }}
          />

          {RADIUS_CORNER_KEYS.map((key) => {
            const offset = handleOffsetPx(key);
            const isRight = RIGHT_CORNERS.includes(key);
            const isBottom = BOTTOM_CORNERS.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-label={`${RADIUS_CORNER_LABELS[key]} radius`}
                title={`${RADIUS_CORNER_LABELS[key]} — drag to adjust`}
                onPointerDown={(e) => {
                  draggingRef.current = key;
                  boxRef.current?.setPointerCapture(e.pointerId);
                }}
                className="-translate-x-1/2 -translate-y-1/2 absolute h-3.5 w-3.5 cursor-grab rounded-full border-2 border-brand-600 bg-white shadow-sm transition active:cursor-grabbing active:scale-90 dark:bg-zinc-800"
                style={{
                  left: isRight ? BOX_WIDTH - offset : offset,
                  top: isBottom ? BOX_HEIGHT : 0,
                }}
              />
            );
          })}
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-zinc-500">
        Drag a corner handle, or use the sliders below.
      </p>

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
