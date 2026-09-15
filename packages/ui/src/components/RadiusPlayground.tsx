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

const INITIAL_BOX_WIDTH = 200;
const INITIAL_BOX_HEIGHT = 140;

const DEFAULT_CORNERS: RadiusCorners = {
  topLeft: 12,
  topRight: 12,
  bottomRight: 12,
  bottomLeft: 12,
};

const LEFT_CORNERS: (keyof RadiusCorners)[] = ["topLeft", "bottomLeft"];
const TOP_CORNERS: (keyof RadiusCorners)[] = ["topLeft", "topRight"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function RadiusPlayground() {
  const [corners, setCorners] = useState<RadiusCorners>(DEFAULT_CORNERS);
  const [unit, setUnit] = useState<RadiusUnit>("px");
  const [linked, setLinked] = useState(true);

  const boxRef = useRef<HTMLDivElement>(null);
  // Captures which corner was grabbed and what it measured at the time, so the drag applies a
  // delta. Tracking the absolute pointer position instead would snap the radius to whatever
  // number happened to sit under your cursor the instant you pressed.
  const dragRef = useRef<{
    corner: keyof RadiusCorners;
    startRadius: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

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

  /** Which corner the pointer is closest to — the quadrant it pressed in. With no handles on the
   *  shape, this is what tells an unlinked drag which corner you meant. */
  function grabbedCorner(
    clientX: number,
    clientY: number,
  ): keyof RadiusCorners {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return "topLeft";
    const isRight = clientX > rect.left + rect.width / 2;
    const isBottom = clientY > rect.top + rect.height / 2;
    if (isBottom) return isRight ? "bottomRight" : "bottomLeft";
    return isRight ? "topRight" : "topLeft";
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex min-h-56 items-center justify-center rounded-lg border border-black/10 bg-zinc-100 p-4 dark:border-white/10 dark:bg-surface-elevated">
        {/* The resize grip lives in this wrapper's padding rather than on the shape itself, so
            grabbing it can't also start a radius drag. Native `resize` needs a non-visible
            overflow to show up at all. */}
        <div
          className="resize overflow-hidden pr-4 pb-4"
          style={{
            width: INITIAL_BOX_WIDTH,
            height: INITIAL_BOX_HEIGHT,
            minWidth: 80,
            minHeight: 60,
            maxWidth: "100%",
            maxHeight: 320,
          }}
        >
          <div
            ref={boxRef}
            onPointerDown={(e) => {
              const corner = grabbedCorner(e.clientX, e.clientY);
              dragRef.current = {
                corner,
                startRadius: corners[corner],
                pointerX: e.clientX,
                pointerY: e.clientY,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const drag = dragRef.current;
              if (!drag) return;
              // Projected toward the middle of the box, so "pull it inward to round it" holds for
              // every corner. Without the per-corner signs, the right-hand corners would round as
              // you dragged away from them, which reads as broken immediately.
              const signX = LEFT_CORNERS.includes(drag.corner) ? 1 : -1;
              const signY = TOP_CORNERS.includes(drag.corner) ? 1 : -1;
              const delta =
                ((e.clientX - drag.pointerX) * signX +
                  (e.clientY - drag.pointerY) * signY) /
                2;
              updateCorner(
                drag.corner,
                clamp(Math.round(drag.startRadius + delta), 0, max),
              );
            }}
            onPointerUp={(e) => {
              dragRef.current = null;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            className="h-full w-full cursor-grab touch-none select-none bg-brand-500 active:cursor-grabbing"
            style={{ borderRadius: value }}
          />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-zinc-500">
        Drag the shape inward to round the nearest corner. Drag the bottom-right
        grip to resize.
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
