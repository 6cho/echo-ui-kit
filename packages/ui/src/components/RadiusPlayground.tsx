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

const INITIAL_SIZE = { width: 200, height: 140 };
const MIN_WIDTH = 60;
const MIN_HEIGHT = 48;
const MAX_WIDTH = 300;
const MAX_HEIGHT = 280;

// How far in from an edge still counts as grabbing that edge. Capped against the box's own
// dimensions so a small box doesn't end up with overlapping zones and no middle at all.
const MAX_EDGE_ZONE = 32;

const DEFAULT_CORNERS: RadiusCorners = {
  topLeft: 12,
  topRight: 12,
  bottomRight: 12,
  bottomLeft: 12,
};

const LEFT_CORNERS: (keyof RadiusCorners)[] = ["topLeft", "bottomLeft"];
const TOP_CORNERS: (keyof RadiusCorners)[] = ["topLeft", "topRight"];

type Zone =
  | { kind: "radius"; corner: keyof RadiusCorners }
  | { kind: "resize"; axis: "x" | "y"; sign: 1 | -1 }
  | null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cursorFor(zone: Zone): string {
  if (!zone) return "default";
  if (zone.kind === "radius") return "grab";
  return zone.axis === "x" ? "ew-resize" : "ns-resize";
}

export function RadiusPlayground() {
  const [corners, setCorners] = useState<RadiusCorners>(DEFAULT_CORNERS);
  const [size, setSize] = useState(INITIAL_SIZE);
  const [unit, setUnit] = useState<RadiusUnit>("px");
  const [linked, setLinked] = useState(true);
  const [cursor, setCursor] = useState("default");

  const boxRef = useRef<HTMLDivElement>(null);
  // What was grabbed and what it measured at the time, so every drag applies a delta rather than
  // snapping to whatever value happened to sit under the cursor when you pressed.
  const dragRef = useRef<{
    zone: NonNullable<Zone>;
    startRadius: number;
    startWidth: number;
    startHeight: number;
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

  /**
   * What the pointer is over: a corner rounds, an edge resizes, the middle does nothing.
   *
   * Splitting by region is what lets both gestures live on the same shape without any handles
   * drawn on top of it — the only affordance is the cursor, which changes as you move across.
   */
  function zoneAt(clientX: number, clientY: number): Zone {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const zone = Math.min(MAX_EDGE_ZONE, rect.width / 3, rect.height / 3);

    const nearLeft = x <= zone;
    const nearRight = x >= rect.width - zone;
    const nearTop = y <= zone;
    const nearBottom = y >= rect.height - zone;

    // Corners win over edges: where the two overlap, you're at a corner.
    if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
      const corner = nearBottom
        ? nearRight
          ? "bottomRight"
          : "bottomLeft"
        : nearRight
          ? "topRight"
          : "topLeft";
      return { kind: "radius", corner };
    }
    if (nearLeft) return { kind: "resize", axis: "x", sign: -1 };
    if (nearRight) return { kind: "resize", axis: "x", sign: 1 };
    if (nearTop) return { kind: "resize", axis: "y", sign: -1 };
    if (nearBottom) return { kind: "resize", axis: "y", sign: 1 };
    return null;
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) {
      setCursor(cursorFor(zoneAt(e.clientX, e.clientY)));
      return;
    }
    const dx = e.clientX - drag.pointerX;
    const dy = e.clientY - drag.pointerY;
    // Pulled out as a local so the narrowing below survives into the setSize callbacks —
    // `drag.zone` is a mutable property, which discards it at the closure boundary.
    const { zone } = drag;

    if (zone.kind === "radius") {
      // Projected toward the middle of the box, so "pull inward to round it" holds for every
      // corner. Without the per-corner signs the right-hand corners would round as you dragged
      // away from them, which reads as broken immediately.
      const signX = LEFT_CORNERS.includes(zone.corner) ? 1 : -1;
      const signY = TOP_CORNERS.includes(zone.corner) ? 1 : -1;
      const delta = (dx * signX + dy * signY) / 2;
      updateCorner(
        zone.corner,
        clamp(Math.round(drag.startRadius + delta), 0, max),
      );
      return;
    }

    // Doubled because the box is centred: moving one edge out by a pixel widens it by two, so
    // without this the edge drifts behind the pointer at half speed.
    if (zone.axis === "x") {
      setSize((current) => ({
        ...current,
        width: clamp(
          Math.round(drag.startWidth + dx * zone.sign * 2),
          MIN_WIDTH,
          MAX_WIDTH,
        ),
      }));
    } else {
      setSize((current) => ({
        ...current,
        height: clamp(
          Math.round(drag.startHeight + dy * zone.sign * 2),
          MIN_HEIGHT,
          MAX_HEIGHT,
        ),
      }));
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex min-h-72 items-center justify-center rounded-lg border border-black/10 bg-zinc-100 p-4 dark:border-white/10 dark:bg-surface-elevated">
        <div
          ref={boxRef}
          onPointerDown={(e) => {
            const zone = zoneAt(e.clientX, e.clientY);
            if (!zone) return;
            dragRef.current = {
              zone,
              startRadius: zone.kind === "radius" ? corners[zone.corner] : 0,
              startWidth: size.width,
              startHeight: size.height,
              pointerX: e.clientX,
              pointerY: e.clientY,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => {
            dragRef.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerLeave={() => {
            if (!dragRef.current) setCursor("default");
          }}
          className="touch-none select-none bg-brand-500"
          style={{
            width: size.width,
            height: size.height,
            borderRadius: value,
            cursor,
          }}
        />
      </div>
      <p className="-mt-2 text-[11px] text-zinc-500">
        {`Drag a corner to round it, an edge to resize — ${size.width} × ${size.height}`}
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
