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
const PAD = 44;
const VIEW = SIZE + PAD * 2;
const MIN_Y = -0.5;
const MAX_Y = 1.5;

const MIN_DURATION = 100;
const MAX_DURATION = 3000;

function toSvgX(x: number): number {
  return PAD + x * SIZE;
}
function toSvgY(y: number): number {
  return PAD + (1 - y) * SIZE;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function EasingEditor() {
  const [bezier, setBezier] = useState<CubicBezier>({
    x1: 0.4,
    y1: 0,
    x2: 0.2,
    y2: 1,
  });
  const [duration, setDuration] = useState(600);
  const [progress, setProgress] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<"p1" | "p2" | null>(null);

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
      const elapsed = now - start;
      if (elapsed >= duration) start = now;
      setProgress(Math.min(1, (elapsed % duration) / duration));
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration]);

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
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Preview
        </span>
        <div className="relative h-8 rounded-lg border border-black/10 bg-zinc-100 dark:border-white/10 dark:bg-surface-elevated">
          <div
            className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-md bg-brand-600"
            style={{ left: `calc(${eased * 100}% - ${eased * 20}px)` }}
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
        onChange={setDuration}
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
