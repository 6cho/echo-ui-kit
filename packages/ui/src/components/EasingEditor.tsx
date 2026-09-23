import {
  type CubicBezier,
  cubicBezierProgress,
  EASING_PRESETS,
  formatCubicBezier,
  formatEasingCss,
} from "@echo-ui-kit/tools-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { CssOutput } from "./CssOutput";
import { Slider } from "./Slider";
import { ToolColumns } from "./ToolColumns";

// The plotted square is SIZE across; PAD is the margin around it. The padding isn't decorative —
// y is allowed outside 0–1 so an overshooting curve (a "back" ease) can be drawn where it actually
// goes instead of being clipped flat at the edge of its own box.
const SIZE = 200;
const MIN_Y = -0.5;
const MAX_Y = 1.5;
const HANDLE_RADIUS = 8;
const HANDLE_STROKE = 2.5;

// Derived, not chosen. A handle dragged to MAX_Y sits half a square above the box, and it is a
// circle, so the margin has to cover both or the thing you were dragging ends up outside the
// canvas and can't be picked up again — which is exactly what a hand-picked 44 did. The extra few
// pixels keep it from sitting flush against the edge at full stretch.
const PAD =
  Math.ceil(
    Math.max(MAX_Y - 1, -MIN_Y) * SIZE + HANDLE_RADIUS + HANDLE_STROKE / 2,
  ) + 8;
const VIEW = SIZE + PAD * 2;

// How far past its endpoints a curve actually travels, which is not how far its control points
// may be dragged: a cubic bezier only gets about four ninths of the way to a control value. At
// the extremes of the range above, the curve itself reaches -0.299 and 1.299 — measured across
// the whole allowed range of both controls, not reasoned about.
const MAX_OVERSHOOT = 0.3;
const TRACK_SPAN = 1 + MAX_OVERSHOOT * 2;

// The preview's geometry. Only the first three are chosen; the horizontal spacing is derived from
// them, because a dot with room above and below it but sitting flush against the end of its own
// track is the thing that looks wrong. Padding it by the same margin in both directions is what
// makes an ordinary ease read as a pill travelling inside a pill.
const TRACK_HEIGHT = 48;
const TRACK_INSET = 8;
const DOT_SIZE = 20;
// What's left above and below the dot inside the inner track — and so what's left at either end
// of it too.
const DOT_INSET = (TRACK_HEIGHT - TRACK_INSET * 2 - DOT_SIZE) / 2;
// The distance the dot's left edge can cover: the outer frame, less the padding at both ends and
// the dot's own width. Overshoot is spent out of this, which is why the outer frame's padding is
// what an overshooting dot keeps from the dashed edge.
const TRAVEL = `(100% - ${TRACK_INSET * 2 + DOT_SIZE}px)`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Where a curve value sits along the outer frame's full travel, as a fraction of it. */
function trackFraction(value: number): number {
  return clamp((value + MAX_OVERSHOOT) / TRACK_SPAN, 0, 1);
}

/** Left edge of the dot at a given curve value. */
function dotLeft(value: number): string {
  return `calc(${TRACK_INSET}px + ${trackFraction(value)} * ${TRAVEL})`;
}

const MIN_DURATION = 100;
const MAX_DURATION = 3000;

// Where the preview settles, and where it starts. A loop running at its real speed the instant
// the tool opens is a hard thing to look at — it arrives already going, and then never stops. It
// opens at half speed instead and works up to the real one over the first few passes, so the
// first thing you see is the shape of the curve rather than a flicker.
const DEFAULT_DURATION = 1000;
const WARMUP_DURATION = 2000;
// Fraction of the remaining gap kept at the end of each loop: 2000, 1400, 1160, 1064, and then
// close enough. Geometric rather than linear so the early passes differ most, which is what
// reads as speeding up rather than as a sequence of different speeds.
const WARMUP_DECAY = 0.4;
// Below this the next step isn't visible, so it stops rather than converging forever.
const WARMUP_SETTLE_MS = 25;

function toSvgX(x: number): number {
  return PAD + x * SIZE;
}
function toSvgY(y: number): number {
  return PAD + (1 - y) * SIZE;
}

export function EasingEditor() {
  const [bezier, setBezier] = useState<CubicBezier>({
    x1: 0.4,
    y1: 0,
    x2: 0.2,
    y2: 1,
  });
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [progress, setProgress] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<"p1" | "p2" | null>(null);
  // Read by the animation loop, which is mounted once and must not be torn down and restarted on
  // every tick of the duration slider — that would reset the loop mid-pass on every drag frame.
  const durationRef = useRef(duration);
  // What the loop is actually running at, which is only the duration once it has warmed up.
  const playbackRef = useRef(WARMUP_DURATION);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  /** Reaching for the slider is taking control of the speed, so the warm-up stops there. */
  function handleDurationChange(next: number) {
    setDuration(next);
    playbackRef.current = next;
  }

  const css = useMemo(
    () => formatEasingCss(bezier, duration),
    [bezier, duration],
  );

  // Drives the preview off the same solver that shapes the curve, rather than handing the easing
  // to a CSS animation. Two reasons: a CSS keyframes rule would have to live in the consuming
  // app's stylesheet (this package deliberately ships no global CSS), and running the math here
  // means the dot and the curve can never disagree about what the easing does.
  useEffect(() => {
    let frame = 0;
    let start = performance.now();
    function tick(now: number) {
      const cycle = playbackRef.current;
      const elapsed = now - start;
      if (elapsed >= cycle) {
        start = now;
        // Speed up between passes, never during one: changing the rate mid-travel would make the
        // dot jump, which is the opposite of what the ramp is for.
        const target = durationRef.current;
        const next = target + (cycle - target) * WARMUP_DECAY;
        playbackRef.current =
          Math.abs(next - target) < WARMUP_SETTLE_MS ? target : next;
        setProgress(0);
      } else {
        setProgress(elapsed / cycle);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    // The SVG scales to its container, so client pixels have to be converted back through the
    // viewBox before they mean anything in curve space.
    const scale = rect.width / VIEW;
    const localX = (e.clientX - rect.left) / scale;
    const localY = (e.clientY - rect.top) / scale;
    return {
      x: clamp((localX - PAD) / SIZE, 0, 1),
      y: clamp(1 - (localY - PAD) / SIZE, MIN_Y, MAX_Y),
    };
  }

  const eased = cubicBezierProgress(bezier, progress);
  // Read off the control values rather than the animated position, so the note doesn't blink on
  // and off as the dot passes through the overshooting part of its own travel.
  const overshoots =
    bezier.y1 < 0 || bezier.y2 < 0 || bezier.y1 > 1 || bezier.y2 > 1;
  const activePreset = EASING_PRESETS.find(
    (p) =>
      p.value.x1 === bezier.x1 &&
      p.value.y1 === bezier.y1 &&
      p.value.x2 === bezier.x2 &&
      p.value.y2 === bezier.y2,
  );

  return (
    <ToolColumns className="p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="w-full touch-none select-none rounded-lg border border-black/10 bg-zinc-100 dark:border-white/10 dark:bg-surface-elevated"
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          const { x, y } = pointFromEvent(e);
          setBezier((c) =>
            draggingRef.current === "p1"
              ? { ...c, x1: x, y1: y }
              : { ...c, x2: x, y2: y },
          );
        }}
        onPointerUp={(e) => {
          draggingRef.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        aria-label="Easing curve"
      >
        <title>Easing curve</title>
        <rect
          x={PAD}
          y={PAD}
          width={SIZE}
          height={SIZE}
          className="fill-none stroke-black/10 dark:stroke-white/10"
          strokeWidth={1}
        />
        <line
          x1={toSvgX(0)}
          y1={toSvgY(0)}
          x2={toSvgX(1)}
          y2={toSvgY(1)}
          className="stroke-black/10 dark:stroke-white/10"
          strokeDasharray="4 4"
          strokeWidth={1}
        />

        <line
          x1={toSvgX(0)}
          y1={toSvgY(0)}
          x2={toSvgX(bezier.x1)}
          y2={toSvgY(bezier.y1)}
          className="stroke-brand-500/40"
          strokeWidth={1.5}
        />
        <line
          x1={toSvgX(1)}
          y1={toSvgY(1)}
          x2={toSvgX(bezier.x2)}
          y2={toSvgY(bezier.y2)}
          className="stroke-brand-500/40"
          strokeWidth={1.5}
        />

        <path
          d={`M ${toSvgX(0)} ${toSvgY(0)} C ${toSvgX(bezier.x1)} ${toSvgY(bezier.y1)}, ${toSvgX(bezier.x2)} ${toSvgY(bezier.y2)}, ${toSvgX(1)} ${toSvgY(1)}`}
          className="fill-none stroke-brand-500"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Where the animation currently sits, on the curve itself — the link between the shape
            and the motion below it. */}
        <circle
          cx={toSvgX(progress)}
          cy={toSvgY(eased)}
          r={5}
          className="fill-brand-600"
        />

        {(
          [
            { id: "p1", x: bezier.x1, y: bezier.y1 },
            { id: "p2", x: bezier.x2, y: bezier.y2 },
          ] as const
        ).map((handle) => (
          <circle
            key={handle.id}
            cx={toSvgX(handle.x)}
            cy={toSvgY(handle.y)}
            r={8}
            className="cursor-grab fill-white stroke-brand-500 active:cursor-grabbing dark:fill-zinc-800"
            strokeWidth={2.5}
            onPointerDown={(e) => {
              draggingRef.current = handle.id;
              svgRef.current?.setPointerCapture(e.pointerId);
            }}
          />
        ))}
      </svg>
      <p className="-mt-2 text-[11px] text-zinc-500">
        Drag either handle to reshape the curve.
      </p>

      {/* The same easing applied to motion. A curve you can only read as a shape doesn't tell you
          how it feels, which is the only thing that actually decides whether it's right. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Preview
          </span>
          {overshoots && (
            <span className="text-[11px] text-zinc-500">
              Overshoots its own range
            </span>
          )}
        </div>
        {/* Two frames, because the dot genuinely does leave the distance it was asked to travel.
            The inner one is that distance — where the animation starts and stops. The outer one
            is the room an overshooting ease needs on either side of it. With one frame the dot
            either escapes the box, which reads as a rendering fault, or gets clipped, which is a
            lie about what the easing does. */}
        <div
          className="relative rounded-xl border border-black/10 border-dashed dark:border-white/10"
          style={{ height: TRACK_HEIGHT }}
        >
          {/* Brackets the 0-to-1 travel, with the dot's own margin added at either end so it has
              the same clearance sideways as it does up and down. */}
          <div
            className="clay-inset absolute rounded-lg bg-zinc-100 dark:bg-surface-elevated"
            style={{
              top: TRACK_INSET,
              bottom: TRACK_INSET,
              left: `calc(${TRACK_INSET - DOT_INSET}px + ${trackFraction(0)} * ${TRAVEL})`,
              width: `calc(${trackFraction(1) - trackFraction(0)} * ${TRAVEL} + ${
                DOT_SIZE + DOT_INSET * 2
              }px)`,
            }}
          />
          <div
            className="clay -translate-y-1/2 absolute top-1/2 rounded-md bg-brand-600"
            style={{
              left: dotLeft(eased),
              height: DOT_SIZE,
              width: DOT_SIZE,
            }}
          />
        </div>
      </div>

      <Slider
        label="Duration"
        value={duration}
        min={MIN_DURATION}
        max={MAX_DURATION}
        step={50}
        displayValue={`${duration}ms`}
        onChange={handleDurationChange}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Presets
        </span>
        <div className="flex flex-wrap gap-1.5">
          {EASING_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setBezier(preset.value)}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-medium transition active:scale-95 ${
                activePreset?.id === preset.id
                  ? "border-brand-500 text-brand-600 dark:text-brand-500"
                  : "border-black/10 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
        <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
          {formatCubicBezier(bezier)}
        </span>
      </div>

      <CssOutput code={css} />
    </ToolColumns>
  );
}
