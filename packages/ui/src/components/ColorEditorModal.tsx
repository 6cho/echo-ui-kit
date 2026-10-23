import { fromHsl, toHsl } from "@echo-ui-kit/tools-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "./Slider";

/**
 * The palette as one bar spanning its container, every colour a square except the one in use,
 * which stretches to fill the rest from wherever it sits in the palette.
 *
 * The stretched segment shows the colour as it now is, so adjusting it visibly changes that entry
 * of the palette rather than a swatch off to one side — and it is the place to pick any colour
 * at all, since clicking it opens the system colour picker. A colour that came from none of the
 * palette's entries gets a stretched segment of its own at the end.
 */
function PaletteSelector({
  label,
  colors,
  activeIndex,
  activeHex,
  onPick,
  onCustom,
}: {
  label: string;
  colors: string[];
  activeIndex: number;
  activeHex: string;
  onPick: (hex: string, index: number) => void;
  onCustom: (hex: string) => void;
}) {
  const shown =
    activeIndex < colors.length
      ? colors.map((hex, index) => (index === activeIndex ? activeHex : hex))
      : [...colors, activeHex];

  return (
    <div className="flex h-7 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
      {shown.map((hex, index) =>
        index === activeIndex ? (
          <label
            // biome-ignore lint/suspicious/noArrayIndexKey: a segment is a position in the palette — the same hex can appear twice
            key={index}
            title="Pick any colour"
            style={{ backgroundColor: hex, flexGrow: 1 }}
            className="relative min-w-7 basis-7 cursor-pointer transition-[flex-grow,background-color] duration-500 ease-fluid"
          >
            <input
              type="color"
              aria-label={`${label} — pick any colour`}
              value={hex}
              onChange={(event) => onCustom(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        ) : (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: a segment is a position in the palette — the same hex can appear twice
            key={index}
            type="button"
            onClick={() => onPick(hex, index)}
            title={hex}
            style={{ backgroundColor: hex, flexGrow: 0 }}
            className="w-7 shrink-0 basis-7 cursor-pointer transition-[flex-grow,background-color] duration-500 ease-fluid hover:brightness-110 active:brightness-125"
          />
        ),
      )}
    </div>
  );
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

/**
 * Every way of choosing one colour, in one place: the palette, the system picker behind the
 * palette's stretched segment, and hue, saturation and lightness for fine-tuning whatever was
 * picked.
 *
 * Floats at the top centre of the window — the page in the web app, the side panel in the
 * extension — rather than over a dimmed page, because the point of choosing a colour here is
 * watching what it does to something else, and a backdrop would hide exactly that. It leaves when Escape is pressed, when it is closed, or when anything is
 * clicked that is neither the sheet nor marked `data-color-trigger` — the things that open it can
 * be clicked to retarget it without it closing in between.
 */
export function ColorEditorModal({
  open,
  title,
  selectionKey,
  colors,
  activeIndex,
  value,
  onPick,
  onChange,
  onClose,
}: {
  open: boolean;
  title: string;
  /** Identifies what is being edited, so held slider values don't leak from one colour to another. */
  selectionKey: string;
  colors: string[];
  /** Which of `colors` the value is, or came from; `colors.length` for none of them. */
  activeIndex: number;
  value: string;
  /** A palette entry picked outright. */
  onPick: (hex: string, index: number) => void;
  /** The colour changed some other way — the sliders, or the system picker. */
  onChange: (hex: string) => void;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Held while dragging rather than read back from the hex each time: a grey has no hue, so
  // taking saturation to zero and back would otherwise lose the hue it started with. Read afresh
  // whenever the colour is changed some other way.
  const [held, setHeld] = useState<(Hsl & { key: string; hex: string }) | null>(
    null,
  );
  const hsl: Hsl = useMemo(() => {
    if (
      held &&
      held.key === selectionKey &&
      held.hex.toLowerCase() === value.toLowerCase()
    ) {
      return held;
    }
    try {
      const color = toHsl(value);
      return { h: color.h ?? 0, s: color.s, l: color.l };
    } catch {
      return { h: 0, s: 0, l: 0 };
    }
  }, [held, selectionKey, value]);

  function adjust(next: Hsl) {
    const hex = fromHsl(next);
    setHeld({ key: selectionKey, hex, ...next });
    onChange(hex);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (sheetRef.current?.contains(target)) return;
      if (target?.closest?.("[data-color-trigger]")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-label={title}
      // Centred with `translate`, which is its own property in Tailwind v4, so it composes with
      // the entrance animation's transform rather than being overwritten by it.
      className="clay fixed top-3 left-1/2 z-40 flex w-[min(480px,calc(100vw-24px))] -translate-x-1/2 origin-top animate-popover-in flex-col gap-5 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-surface-elevated"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-5 w-5 shrink-0 rounded-md border border-black/10 transition-colors dark:border-white/10"
          style={{ backgroundColor: value }}
        />
        <span className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {title}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">
          {value.toLowerCase()}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 active:scale-[0.94] dark:hover:bg-surface-hover dark:hover:text-zinc-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <PaletteSelector
        label={title}
        colors={colors}
        activeIndex={activeIndex}
        activeHex={value}
        onPick={onPick}
        onCustom={onChange}
      />

      <div className="flex flex-col gap-4">
        <Slider
          label="Hue"
          value={Math.round(hsl.h)}
          min={0}
          max={360}
          step={1}
          displayValue={`${Math.round(hsl.h)}°`}
          trackBackground="linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))"
          thumbColor={value}
          onChange={(h) => adjust({ ...hsl, h })}
        />
        <Slider
          label="Saturation"
          value={Math.round(hsl.s * 100)}
          min={0}
          max={100}
          step={1}
          displayValue={`${Math.round(hsl.s * 100)}%`}
          trackBackground={`linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l * 100}%), hsl(${hsl.h} 100% ${hsl.l * 100}%))`}
          thumbColor={value}
          onChange={(next) => adjust({ ...hsl, s: next / 100 })}
        />
        <Slider
          label="Lightness"
          value={Math.round(hsl.l * 100)}
          min={0}
          max={100}
          step={1}
          displayValue={`${Math.round(hsl.l * 100)}%`}
          trackBackground={`linear-gradient(to right, hsl(${hsl.h} ${hsl.s * 100}% 0%), hsl(${hsl.h} ${hsl.s * 100}% 50%), hsl(${hsl.h} ${hsl.s * 100}% 100%))`}
          thumbColor={value}
          onChange={(next) => adjust({ ...hsl, l: next / 100 })}
        />
      </div>
    </div>
  );
}
