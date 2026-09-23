import {
  type CubicBezier,
  cubicBezierParamAtX,
  cubicBezierProgress,
  EASING_PRESETS,
  formatCubicBezier,
  formatLinearEasing,
  formatTimingCss,
  LINEAR_MAX_POINTS,
  linearPointAt,
  linearProgress,
  resampleLinear,
} from "@echo-ui-kit/tools-core";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

/**
 * Where a cubic's grab points sit, as fractions of the box's width.
 *
 * Two, not three, and that is the whole of it: a cubic bezier has exactly two free heights, so
 * two handles can be placed independently and any third has nowhere to be but where those two put
 * it. Three handles meant dragging one dragged the others, which is most of the point of having
 * them. If you want points that genuinely move alone, that is what the linear mode is.
 *
 * At the quarter marks so they fall on the grid, and so each one means something sayable: how far
 * along the animation is a quarter and three quarters of the way through its duration.
 */
const CUBIC_HANDLES = [0.25, 0.75] as const;

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
 * Moves the curve so the dragged handle lands on `targetY` and the other one does not move at
 * all.
 *
 * Two handles, two free heights: the system is square, so it is solved outright rather than
 * compromised. Hold one handle where it is, put the other where the pointer is, and there is
 * exactly one pair of control heights that does both — which is why there are two handles and not
 * three. Clamping is the only thing that can stop it: if the heights a request needs are outside
 * what CSS will take, the curve goes as far as it can and the held handle gives a little.
 */
function reshapeAt(
  bezier: CubicBezier,
  dragged: number,
  targetY: number,
): CubicBezier {
  const params = CUBIC_HANDLES.map((at) => cubicBezierParamAtX(bezier, at));
  const first = params[0];
  const second = params[1];
  if (first === undefined || second === undefined) return bezier;

  const a = weightsAt(first);
  const b = weightsAt(second);
  const determinant = a.weight1 * b.weight2 - a.weight2 * b.weight1;
  // The two handles influence the control heights in the same proportion, so no pair of heights
  // puts them anywhere but on one line together. Can't happen for distinct moments on a sane
  // curve, but a degenerate one shouldn't produce infinities.
  if (Math.abs(determinant) < 1e-9) return bezier;

  // What each handle is asking for, with the endpoints' fixed contribution taken out: the dragged
  // one follows the pointer, the other stays exactly where it already is.
  const wantedA =
    (dragged === 0 ? targetY : heightAt(bezier, first)) - first ** 3;
  const wantedB =
    (dragged === 1 ? targetY : heightAt(bezier, second)) - second ** 3;

  return {
    ...bezier,
    y1: clamp(
      (wantedA * b.weight2 - a.weight2 * wantedB) / determinant,
      MIN_Y,
      MAX_Y,
    ),
    y2: clamp(
      (a.weight1 * wantedB - wantedA * b.weight1) / determinant,
      MIN_Y,
      MAX_Y,
    ),
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

// The square each example animates, and the box it animates in. A fixed size because several of
// the examples move it by a measured distance, and that distance has to know how big it is.
const SHAPE = 24;
const TILE_PAD = 10;
// Set here rather than with a rounded-* class. The theme's radii are sized for panels and cards,
// where doubling them for claymorphism is the whole point; at 24px across, the same radius is
// half the shape and turns every example into a circle.
const SHAPE_RADIUS = 6;
// The mark that tells one side of the rotating square from the other three.
const SHAPE_DOT = 6;
const SHAPE_DOT_INSET = 3;

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="clay-inset relative h-16 overflow-hidden rounded-lg bg-zinc-100 dark:bg-surface-elevated">
        {children}
      </div>
      <span className="truncate text-center text-[10px] text-zinc-500">
        {label}
      </span>
    </div>
  );
}

function Centred({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      {children}
    </div>
  );
}

/**
 * The same easing driving several different properties at once.
 *
 * A dot on a track tells you the rhythm but not what it does to anything: the same curve that
 * feels crisp sliding a panel in can look broken on a fade, and an overshoot that reads as
 * playful on a scale reads as a glitch on an opacity that has nowhere above 1 to go. Six at once
 * is cheap — they all read the one number that is already being computed for the curve — and
 * seeing them together is the only way to notice that.
 */
function Examples({ eased }: { eased: number }) {
  const shape = "bg-brand-600";
  const size = {
    height: SHAPE,
    width: SHAPE,
    borderRadius: SHAPE_RADIUS,
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile label="Fade">
        <Centred>
          <div className={shape} style={{ ...size, opacity: eased }} />
        </Centred>
      </Tile>

      <Tile label="Scale">
        <Centred>
          <div
            className={shape}
            style={{ ...size, transform: `scale(${0.3 + eased * 0.7})` }}
          />
        </Centred>
      </Tile>

      <Tile label="Move">
        {/* Where the journey starts and ends, because without them a square sliding inside a
            plain box has nothing to have overshot. */}
        {[0, 1].map((end) => (
          <div
            key={end}
            className="absolute h-1 w-1 rounded-full bg-black/20 dark:bg-white/20"
            style={{
              top: "50%",
              marginTop: -2,
              left: `calc(${TILE_PAD + SHAPE / 2 - 2}px + ${trackFraction(end)} * (100% - ${TILE_PAD * 2 + SHAPE}px))`,
            }}
          />
        ))}
        <div
          className={`absolute ${shape}`}
          style={{
            ...size,
            top: "50%",
            marginTop: -SHAPE / 2,
            // Mapped across the whole range a curve can reach, not just nought to one, so an
            // overshooting ease runs past the far marker and comes back instead of being clipped
            // off the side of the tile where nobody can see it happen.
            left: `calc(${TILE_PAD}px + ${trackFraction(eased)} * (100% - ${TILE_PAD * 2 + SHAPE}px))`,
          }}
        />
      </Tile>

      <Tile label="Rotate">
        <Centred>
          {/* The same square as everywhere else, with one side marked. Without the mark a square
              is the same picture every quarter turn, and half a turn of one is a very convincing
              animation of nothing at all. */}
          <div
            className={`relative ${shape}`}
            style={{ ...size, transform: `rotate(${eased * 180}deg)` }}
          >
            <span
              className="absolute rounded-full bg-white/90"
              style={{
                height: SHAPE_DOT,
                width: SHAPE_DOT,
                top: SHAPE_DOT_INSET,
                left: (SHAPE - SHAPE_DOT) / 2,
              }}
            />
          </div>
        </Centred>
      </Tile>

      <Tile label="Drop">
        <Centred>
          <div
            className={shape}
            style={{
              ...size,
              // Starts above its resting place and arrives at it, so an overshooting curve dips
              // below and settles — the one example where overshoot looks like what it is for.
              transform: `translateY(${(1 - eased) * -22}px)`,
            }}
          />
        </Centred>
      </Tile>

      <Tile label="Stretch">
        <Centred>
          <div
            className="h-2 rounded-full bg-brand-600"
            style={{
              // Full is deliberately short of the tile, leaving somewhere for an overshoot to go.
              // A width can't be negative either, so an undershooting curve holds at nothing.
              width: `${Math.max(0, eased) * 70}%`,
            }}
          />
        </Centred>
      </Tile>
    </div>
  );
}

type EasingMode = "cubic" | "linear";

export function EasingEditor() {
  const [mode, setMode] = useState<EasingMode>("cubic");
  const [bezier, setBezier] = useState<CubicBezier>({
    x1: 0.4,
    y1: 0,
    x2: 0.2,
    y2: 1,
  });
  // The interior points of a linear() function — its ends are 0 and 1 by definition. Starts as a
  // straight line, so the first drag is the first shape rather than an edit of someone else's.
  const [points, setPoints] = useState<number[]>([0.25, 0.5, 0.75]);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [progress, setProgress] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  // Which handle is being dragged, if any — an index into whichever set is on screen.
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

  const isLinear = mode === "linear";
  /** Where the handles sit in time — two fixed quarters for a cubic, evenly spread for linear. */
  const handles = useMemo(
    () =>
      isLinear
        ? points.map((_, index) => linearPointAt(index, points.length))
        : [...CUBIC_HANDLES],
    [isLinear, points],
  );
  /** How far along the animation is at a given moment, under whichever function is active. */
  const valueAt = useCallback(
    (at: number) =>
      isLinear ? linearProgress(points, at) : cubicBezierProgress(bezier, at),
    [isLinear, points, bezier],
  );
  const timingFunction = isLinear
    ? formatLinearEasing(points)
    : formatCubicBezier(bezier);
  const css = useMemo(
    () => formatTimingCss(timingFunction, duration),
    [timingFunction, duration],
  );

  /** Moves one handle, in whichever way the active function moves. */
  function dragHandle(index: number, y: number) {
    if (isLinear) {
      // Nothing to solve: a point in a linear() function *is* the value at its own moment, and
      // moving it moves nothing else. That is the trade against a cubic — more handles that each
      // mean one thing, in exchange for corners between them.
      setPoints((current) =>
        current.map((value, at) => (at === index ? y : value)),
      );
      return;
    }
    setBezier((current) => reshapeAt(current, index, y));
  }

  /** Reads the curve off at a new number of points, so the shape survives the change. */
  function setPointCount(count: number) {
    setPoints((current) => resampleLinear(current, count));
  }

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

  const eased = valueAt(progress);
  // Read off the control values rather than the animated position, so the note doesn't blink on
  // and off as the dot passes through the overshooting part of its own travel.
  const overshoots = isLinear
    ? points.some((value) => value < 0 || value > 1)
    : bezier.y1 < 0 || bezier.y2 < 0 || bezier.y1 > 1 || bezier.y2 > 1;
  const activePreset = EASING_PRESETS.find(
    (p) =>
      p.value.x1 === bezier.x1 &&
      p.value.y1 === bezier.y1 &&
      p.value.x2 === bezier.x2 &&
      p.value.y2 === bezier.y2,
  );

  return (
    <ToolColumns className="p-4">
      {/* Two timing functions with genuinely different trade-offs, not two ways to draw one. A
          cubic is smooth everywhere and has room for exactly two independent handles; a linear
          function has as many independent points as you like and a corner at each one. */}
      <div className="clay-inset flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-surface-elevated">
        {(
          [
            { id: "cubic", label: "Cubic bezier" },
            { id: "linear", label: "Linear" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMode(option.id)}
            className={`flex-1 cursor-pointer rounded-md px-2.5 py-1 font-medium text-xs transition active:scale-95 ${
              mode === option.id
                ? "clay bg-white text-zinc-900 dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="w-full touch-none select-none rounded-lg border border-black/10 bg-zinc-100 dark:border-white/10 dark:bg-surface-elevated"
        onPointerMove={(e) => {
          const dragged = draggingRef.current;
          if (dragged === null) return;
          const { y } = pointFromEvent(e);
          dragHandle(dragged, y);
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

        {/* Straight between the points, because that is exactly what linear() does — drawing it
            smoothed would be a nicer picture of a different timing function. */}
        <path
          d={
            isLinear
              ? `M ${toSvgX(0)} ${toSvgY(0)} ${points
                  .map(
                    (value, index) =>
                      `L ${toSvgX(linearPointAt(index, points.length))} ${toSvgY(value)}`,
                  )
                  .join(" ")} L ${toSvgX(1)} ${toSvgY(1)}`
              : `M ${toSvgX(0)} ${toSvgY(0)} C ${toSvgX(bezier.x1)} ${toSvgY(bezier.y1)}, ${toSvgX(bezier.x2)} ${toSvgY(bezier.y2)}, ${toSvgX(1)} ${toSvgY(1)}`
          }
          className="fill-none stroke-brand-500"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Where the animation currently sits, on the curve itself — the link between the shape
            and the motion below it. */}
        <circle
          cx={toSvgX(progress)}
          cy={toSvgY(eased)}
          r={5}
          className="fill-brand-600"
        />

        {/* Grab points at fixed moments, sitting wherever the curve is at that moment. For a
            cubic these stand in for control points, which sit off the curve on the end of a line
            at a position most of a cubic's users have no intuition for. For a linear function
            they are the function. */}
        {handles.map((at, index) => (
          <circle
            key={at}
            cx={toSvgX(at)}
            cy={toSvgY(valueAt(at))}
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
        {isLinear
          ? "Drag a point up or down. Each one moves on its own."
          : "Drag a handle up or down. A cubic has room for two that move independently."}
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

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-[11px] text-zinc-500 uppercase tracking-wide">
          In use
        </span>
        <Examples eased={eased} />
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

      {isLinear ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-[11px] text-zinc-500 uppercase tracking-wide">
            Points
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(
              { length: LINEAR_MAX_POINTS },
              (_, index) => index + 1,
            ).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setPointCount(count)}
                className={`h-7 w-7 cursor-pointer rounded-md border font-medium text-[11px] transition active:scale-95 ${
                  points.length === count
                    ? "border-brand-500 text-brand-600 dark:text-brand-500"
                    : "border-black/10 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
                }`}
              >
                {count}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-zinc-500">
            Changing the count reads the curve off again rather than resetting
            it.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-[11px] text-zinc-500 uppercase tracking-wide">
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
      )}

      <div className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
        <span className="break-all font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
          {timingFunction}
        </span>
      </div>

      <CssOutput code={css} />
    </ToolColumns>
  );
}
