import {
  fromHsl,
  fromHsv,
  fromRgb255,
  toHsl,
  toHsv,
  toRgb255,
} from "@echo-ui-kit/tools-core";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface Hsv {
  h: number;
  s: number;
  v: number;
}

type Format = "rgb" | "hsl" | "hex";
const FORMATS: Format[] = ["rgb", "hsl", "hex"];

const HUE_GRADIENT =
  "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

// Chromium's screen colour sampler. Absent elsewhere, in which case the button isn't offered.
interface EyeDropperApi {
  open: () => Promise<{ sRGBHex: string }>;
}
const EyeDropper = (
  globalThis as unknown as { EyeDropper?: new () => EyeDropperApi }
).EyeDropper;

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

/**
 * Drag handling for a 2D or 1D control: captures the pointer so a drag that leaves the control
 * keeps steering it, and reports the position as fractions of the control's box.
 */
function dragHandlers(onMove: (x: number, y: number) => void) {
  const report = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onMove(
      clamp((event.clientX - box.left) / box.width),
      clamp((event.clientY - box.top) / box.height),
    );
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      report(event);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) report(event);
    },
  };
}

/** The numbers a format shows for a colour, as strings for the inputs. */
function fieldsFor(hex: string, format: Format): string[] {
  try {
    if (format === "hex") return [hex.replace("#", "").toLowerCase()];
    if (format === "rgb") {
      const { r, g, b } = toRgb255(hex);
      return [r, g, b].map(String);
    }
    const color = toHsl(hex);
    return [
      Math.round(color.h ?? 0),
      Math.round(color.s * 100),
      Math.round(color.l * 100),
    ].map(String);
  } catch {
    return format === "hex" ? ["000000"] : ["0", "0", "0"];
  }
}

/** A colour from a format's fields, or null while they don't yet describe one. */
function colorFrom(fields: string[], format: Format): string | null {
  if (format === "hex") {
    const raw = (fields[0] ?? "").trim().replace(/^#/, "");
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return null;
    const full =
      raw.length === 3
        ? raw
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : raw;
    return `#${full.toLowerCase()}`;
  }
  const numbers = fields.map((field) => Number(field));
  if (
    fields.some((field) => field.trim() === "") ||
    numbers.some(Number.isNaN)
  ) {
    return null;
  }
  const [a = 0, b = 0, c = 0] = numbers;
  if (format === "rgb") {
    return fromRgb255({
      r: clamp(Math.round(a), 0, 255),
      g: clamp(Math.round(b), 0, 255),
      b: clamp(Math.round(c), 0, 255),
    });
  }
  return fromHsl({
    h: clamp(a, 0, 360),
    s: clamp(b, 0, 100) / 100,
    l: clamp(c, 0, 100) / 100,
  });
}

const LABELS: Record<Format, string[]> = {
  rgb: ["R", "G", "B"],
  hsl: ["H", "S", "L"],
  hex: ["HEX"],
};

/**
 * A full colour picker, in the page rather than in the browser's own popup: a saturation and
 * brightness square, a hue bar, an eyedropper where the browser has one, and the colour as
 * numbers in RGB, HSL or hex.
 *
 * Hue is held while dragging, like the editor's sliders: in the square's black bottom edge and
 * white-to-grey left edge every hue is the same colour, so reading the hue back from the hex
 * there would snap the square to red the moment the thumb touched them.
 */
export function ColorPicker({
  value,
  selectionKey,
  onChange,
}: {
  value: string;
  /** Identifies what is being edited, so a held hue doesn't leak from one colour to another. */
  selectionKey: string;
  onChange: (hex: string) => void;
}) {
  const [held, setHeld] = useState<(Hsv & { key: string; hex: string }) | null>(
    null,
  );
  const hsv: Hsv = useMemo(() => {
    if (
      held &&
      held.key === selectionKey &&
      held.hex.toLowerCase() === value.toLowerCase()
    ) {
      return held;
    }
    try {
      return toHsv(value);
    } catch {
      return { h: 0, s: 0, v: 0 };
    }
  }, [held, selectionKey, value]);

  function set(next: Hsv) {
    const hex = fromHsv(next);
    setHeld({ key: selectionKey, hex, ...next });
    onChange(hex);
  }

  const square = dragHandlers((x, y) => set({ ...hsv, s: x, v: 1 - y }));
  const hueBar = dragHandlers((x) => set({ ...hsv, h: x * 360 }));

  function nudgeSquare(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp(hsv.s - step) },
      ArrowRight: { s: clamp(hsv.s + step) },
      ArrowUp: { v: clamp(hsv.v + step) },
      ArrowDown: { v: clamp(hsv.v - step) },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    set({ ...hsv, ...move });
  }

  function nudgeHue(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 1;
    const delta =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -step
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? step
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    set({ ...hsv, h: clamp(hsv.h + delta, 0, 360) });
  }

  // The numbers, as drafts so a half-typed value ("2", "") can sit in a field without being
  // forced back to the current colour. Refilled from the colour whenever it changes from
  // elsewhere — but not while one of the fields is being typed in.
  const [format, setFormat] = useState<Format>("rgb");
  const [drafts, setDrafts] = useState(() => fieldsFor(value, format));
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setDrafts(fieldsFor(value, format));
  }, [value, format]);

  function edit(index: number, text: string) {
    const next = drafts.map((field, at) => (at === index ? text : field));
    setDrafts(next);
    const color = colorFrom(next, format);
    if (color) onChange(color);
  }

  async function sample() {
    if (!EyeDropper) return;
    try {
      const { sRGBHex } = await new EyeDropper().open();
      onChange(sRGBHex);
    } catch {
      // Cancelled with Escape — nothing to do.
    }
  }

  const pureHue = `hsl(${hsv.h} 100% 50%)`;

  return (
    <div className="flex flex-col gap-4">
      {/* Saturation across, brightness up: white over the hue fading right, black over that
          fading up. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        aria-valuenow={Math.round(hsv.s * 100)}
        onKeyDown={nudgeSquare}
        {...square}
        className="relative h-44 cursor-crosshair touch-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        style={{
          backgroundColor: pureHue,
          backgroundImage:
            "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
      >
        <span
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_1px_3px_rgba(0,0,0,0.4)]"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: value,
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        {EyeDropper && (
          <button
            type="button"
            onClick={sample}
            title="Pick a colour from the screen"
            aria-label="Pick a colour from the screen"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 active:scale-[0.94] dark:text-zinc-300 dark:hover:bg-surface-hover"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m2 22 1-1h3l9-9" />
              <path d="M3 21v-3l9-9" />
              <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
            </svg>
          </button>
        )}
        <span
          className="h-9 w-9 shrink-0 rounded-full border border-black/10 dark:border-white/10"
          style={{ backgroundColor: value }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onKeyDown={nudgeHue}
          {...hueBar}
          className="relative h-3 flex-1 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          style={{ backgroundImage: HUE_GRADIENT }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_1px_3px_rgba(0,0,0,0.4)]"
            style={{
              left: `${(hsv.h / 360) * 100}%`,
              backgroundColor: pureHue,
            }}
          />
        </div>
      </div>

      <div className="flex items-start gap-2">
        {drafts.map((field, index) => (
          <label
            // biome-ignore lint/suspicious/noArrayIndexKey: the fields are positions — R, G, B — not items
            key={index}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <input
              value={field}
              inputMode={format === "hex" ? "text" : "numeric"}
              spellCheck={false}
              onFocus={() => {
                typing.current = true;
              }}
              onBlur={() => {
                typing.current = false;
                setDrafts(fieldsFor(value, format));
              }}
              onChange={(event) => edit(index, event.target.value)}
              className="w-full min-w-0 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-center font-mono text-xs text-zinc-800 outline-none transition focus:border-brand-500 dark:border-white/15 dark:text-zinc-100"
            />
            <span className="text-[11px] font-medium text-zinc-500">
              {LABELS[format][index]}
            </span>
          </label>
        ))}
        <button
          type="button"
          onClick={() =>
            setFormat(
              FORMATS[(FORMATS.indexOf(format) + 1) % FORMATS.length] as Format,
            )
          }
          title="Switch between RGB, HSL and hex"
          aria-label={`Showing ${format.toUpperCase()} — switch format`}
          className="flex h-[30px] shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 font-medium text-[11px] text-zinc-500 uppercase transition hover:bg-zinc-100 hover:text-zinc-800 active:scale-[0.94] dark:hover:bg-surface-hover dark:hover:text-zinc-200"
        >
          {format}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
            aria-hidden="true"
          >
            <path d="m7 9 5-5 5 5M7 15l5 5 5-5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
