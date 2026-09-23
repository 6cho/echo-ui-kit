import {
  type CubicBezier,
  cubicBezierParamAtX,
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
const HANDLE_RADIUS = 7;
const HANDLE_STROKE = 2.5;

// How far past its endpoints a curve actually travels, which is not how far its control values
// may be set: a cubic bezier only gets about four ninths of the way to a control value. At the
// extremes of the range above, the curve itself reaches -0.299 and 1.299 — measured across the
// whole allowed range of both controls, not reasoned about.
const MAX_OVERSHOOT = 0.3;

// Derived, not chosen. Everything draggable now sits on the curve, so the margin only has to
// cover where the curve goes, plus the handle's own radius. When the handles were the control
// points themselves this had to cover half a square — they could be dragged to y = 1.5 while the
// curve they shaped never went past 1.3, and the margin that bought was mostly empty frame.
const PAD =
  Math.ceil(MAX_OVERSHOOT * SIZE + HANDLE_RADIUS + HANDLE_STROKE / 2) + 8;
const VIEW = SIZE + PAD * 2;

// Where the grab points sit, as fractions of the box's width — quarter marks of elapsed time,
// fixed there rather than riding along the curve. That is what they mean: how far along the
// animation is a quarter, half and three quarters of the way through its duration. Handles spaced
// along the curve instead would drift left and right as the curve changed, and would be answering
// a question nobody asks.
const HANDLE_POSITIONS = [0.25, 0.5, 0.75] as const;

// Quarters in both directions, so the vertical lines fall exactly under the handles: each one is
// the moment that handle answers for, and the horizontal it crosses is how far along the
// animation would be there. Reading "half the distance by a third of the way through" off a bare
// square means measuring it by eye.
const GRID_STEPS = [0.25, 0.5, 0.75] as const;

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

/**
 * How much each control value counts toward the curve at a given point along it.
 *
 * These are the two middle Bernstein terms. They are what makes a control point a *control* point
 * rather than a point: at parameter u the curve sits at weight1 * P1 + weight2 * P2 + u³, with the
 * endpoints fixed at 0 and 1.
 */
function weightsAt(u: number): { weight1: number; weight2: number } {
  return { weight1: 3 * (1 - u) ** 2 * u, weight2: 3 * (1 - u) * u ** 2 };
}

/** How far along the curve is at a given parameter. */
function heightAt(bezier: CubicBezier, u: number): number {
  const { weight1, weight2 } = weightsAt(u);
  return weight1 * bezier.y1 + weight2 * bezier.y2 + u ** 3;
}

/**
 * Moves the curve so the handle at `dragged` lands on `targetY`, disturbing the other two as
 * little as the curve allows.
 *
 * It cannot leave them alone entirely, and no amount of cleverness changes that: a cubic bezier
 * has exactly two free heights, and there are three handles. Any two of them can be placed
 * anywhere; the third then has nowhere to be but where those two put it. Three handles is one
 * more than the curve has opinions.
 *
 * So the freedom gets spent deliberately instead of accidentally. Every pair of control heights
 * that puts the dragged handle exactly on target forms a line — one equation, two unknowns — and
 * the curve is free to sit anywhere along it. Walking that line to the point where the other two
 * handles move least is a one-dimensional least-squares fit, solved outright rather than
 * searched. The dragged handle still lands exactly under the pointer; the others give up about
 * half the movement they used to.
 *
 * The previous version shared the correction between the control points by how much each was
 * influencing the dragged moment, which minimised how far the *control points* moved. That is a
 * different thing from minimising how far the *handles* move, and it is the handles you can see.
 */
function reshapeAt(
  bezier: CubicBezier,
  dragged: number,
  targetY: number,
): CubicBezier {
  const params = HANDLE_POSITIONS.map((at) => cubicBezierParamAtX(bezier, at));
  const held = params[dragged];
  if (held === undefined) return bezier;

  const { weight1, weight2 } = weightsAt(held);
  const norm = weight1 ** 2 + weight2 ** 2;
  if (norm === 0) return bezier;

  // A point on that line, and the direction along it. Anything of the form base + step * along
  // puts the dragged handle exactly where it was asked to go.
  const wanted = targetY - held ** 3;
  const base = { y1: (wanted * weight1) / norm, y2: (wanted * weight2) / norm };
  const along = { y1: -weight2, y2: weight1 };

  let numerator = 0;
  let denominator = 0;
  params.forEach((u, index) => {
    if (index === dragged) return;
    const other = weightsAt(u);
    // How fast this handle moves as the curve slides along the line, and how far out it already
    // is at the line's starting point.
    const rate = other.weight1 * along.y1 + other.weight2 * along.y2;
    const offset =
      other.weight1 * base.y1 +
      other.weight2 * base.y2 +
      u ** 3 -
      heightAt(bezier, u);
    numerator += rate * offset;
    denominator += rate * rate;
  });
  const step = denominator === 0 ? 0 : -numerator / denominator;

  return {
    ...bezier,
    y1: clamp(base.y1 + step * along.y1, MIN_Y, MAX_Y),
    y2: clamp(base.y2 + step * along.y2, MIN_Y, MAX_Y),
  };
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
  // Which handle is being dragged, if any — an index into HANDLE_POSITIONS.
  const draggingRef = useRef<number | null>(null);
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
    // Clamped to where the curve can actually go, not to where the control values may be set.
    // Dragging into the strip between those two is dragging into nothing.
    return {
      x: clamp((localX - PAD) / SIZE, 0, 1),
      y: clamp(1 - (localY - PAD) / SIZE, -MAX_OVERSHOOT, 1 + MAX_OVERSHOOT),
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
          const dragged = draggingRef.current;
          if (dragged === null) return;
          const { y } = pointFromEvent(e);
          setBezier((current) => reshapeAt(current, dragged, y));
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
        {GRID_STEPS.map((step) => (
          <g key={step}>
            <line
              x1={toSvgX(step)}
              y1={toSvgY(0)}
              x2={toSvgX(step)}
              y2={toSvgY(1)}
              className="stroke-black/[0.09] dark:stroke-white/[0.09]"
              strokeDasharray="1 5"
              strokeLinecap="round"
              strokeWidth={1}
            />
            <line
              x1={toSvgX(0)}
              y1={toSvgY(step)}
              x2={toSvgX(1)}
              y2={toSvgY(step)}
              className="stroke-black/[0.09] dark:stroke-white/[0.09]"
              strokeDasharray="1 5"
              strokeLinecap="round"
              strokeWidth={1}
            />
          </g>
        ))}

        {/* Linear, drawn over the grid rather than under it: it is the thing a curve is read
            against, not another gridline. */}
        <line
          x1={toSvgX(0)}
          y1={toSvgY(0)}
          x2={toSvgX(1)}
          y2={toSvgY(1)}
          className="stroke-black/20 dark:stroke-white/20"
          strokeDasharray="1 5"
          strokeLinecap="round"
          strokeWidth={1.25}
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

        {/* Grab points at fixed moments, sitting wherever the curve is at that moment. The
            control points they stand in for are still what gets written to the CSS, but they are
            no longer something to aim at: a control point sits off the curve, on the end of a
            line, at a position most of a cubic's users have no intuition for — and dragging one
            to the far end of its range put it outside the canvas entirely. */}
        {HANDLE_POSITIONS.map((at, index) => (
          <circle
            key={at}
            cx={toSvgX(at)}
            cy={toSvgY(cubicBezierProgress(bezier, at))}
            r={HANDLE_RADIUS}
            // Vertical only, and the cursor says so before the drag proves it.
            className="cursor-ns-resize fill-white stroke-brand-500 dark:fill-zinc-800"
            strokeWidth={HANDLE_STROKE}
            onPointerDown={(e) => {
              draggingRef.current = index;
              svgRef.current?.setPointerCapture(e.pointerId);
            }}
          />
        ))}
      </svg>
      <p className="-mt-2 text-[11px] text-zinc-500">
        Drag a handle up or down to set how far along the animation is at that
        moment.
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
