import { wcagLevel } from "@echo-ui-kit/tools-core";
import { useEffect, useRef, useState } from "react";
import {
  loadImagePixels,
  type RegionContrastStats,
  regionContrastStats,
} from "../lib/imageContrast";
import { ImageDropZone } from "./ImageDropZone";
import { ToolColumns, ToolWidth } from "./ToolColumns";

// 24px is WCAG's "large text" boundary for non-bold type (18pt), which is the threshold that
// decides whether 3:1 or 4.5:1 applies — so the presets straddle it deliberately rather than
// being arbitrary sizes.
const LARGE_TEXT_MIN_PX = 24;
const AA_LARGE = 3;
const AA_NORMAL = 4.5;

const SIZE_PRESETS = [
  { id: "body", label: "Body", px: 16, weight: 400 },
  { id: "large", label: "Large", px: 24, weight: 600 },
  { id: "display", label: "Display", px: 40, weight: 700 },
] as const;

type SizePresetId = (typeof SIZE_PRESETS)[number]["id"];

// Always offered alongside the palette, because overlay text on a photo is white or black far
// more often than it's a brand color — a picker without them would send you back to the palette
// tool to add one just to answer the most common question this tool exists for.
const ALWAYS_AVAILABLE_TEXT_COLORS = ["#ffffff", "#000000"];

const SAMPLE_TEXT = "The quick brown fox";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-black/10 px-2 py-1.5 dark:border-white/10">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span
        className={`font-mono ${emphasis ? "text-sm font-semibold text-zinc-900 dark:text-zinc-50" : "text-xs text-zinc-600 dark:text-zinc-400"}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Checks a text color against a real screenshot rather than a flat swatch. Drag the sample text
 * anywhere on the image and it scores against the actual pixels underneath.
 *
 * The headline number is the *worst* pixel under the text, not the average: text over a photo
 * fails in patches — a caption that's perfectly legible across a dark building and vanishes where
 * it crosses the sky averages out to "fine" while being unusable in practice.
 */
export function ImageContrastChecker({
  paletteColors,
}: {
  paletteColors: string[];
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pixels, setPixels] = useState<ImageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const [textColor, setTextColor] = useState("#ffffff");
  const [sizeId, setSizeId] = useState<SizePresetId>("large");
  const [stats, setStats] = useState<RegionContrastStats | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const isDraggingRef = useRef(false);

  const size =
    SIZE_PRESETS.find((preset) => preset.id === sizeId) ?? SIZE_PRESETS[1];
  const isLargeText = size.px >= LARGE_TEXT_MIN_PX;
  const passThreshold = isLargeText ? AA_LARGE : AA_NORMAL;

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await loadImagePixels(file);
      setPixels(loaded);
      setImageUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(file);
      });
      setPosition({ x: 0.5, y: 0.5 });
    } catch (caught) {
      console.error("Image load failed", caught);
      setError(
        caught instanceof Error ? caught.message : "Could not load that image",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function clearImage() {
    setPixels(null);
    setStats(null);
    setError(null);
    setImageUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }

  // Revokes the last object URL when this unmounts — without it, the most recently loaded image
  // stays held in memory for the life of the panel, since clearImage/handleFile only ever revoke
  // the *previous* one.
  useEffect(() => {
    return () => {
      setImageUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, []);

  // Measures where the text actually landed rather than predicting it: the sample text's box
  // depends on font metrics and the panel's width, so reading it back from the DOM after layout
  // is the only way to score exactly the pixels the letters cover. That measurement is also what
  // makes `position` load-bearing despite never appearing in the body below — dragging changes
  // the element's DOM position, not any value this effect names, so the rule can't see the link.
  // Taking its advice and dropping it would pin the score to wherever the text first rendered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: position is read via textRef's measured rect, not by name
  useEffect(() => {
    if (!pixels || !stageRef.current || !textRef.current) {
      setStats(null);
      return;
    }
    const stage = stageRef.current.getBoundingClientRect();
    const text = textRef.current.getBoundingClientRect();
    if (stage.width === 0 || stage.height === 0) return;
    setStats(
      regionContrastStats(
        pixels,
        {
          x: (text.left - stage.left) / stage.width,
          y: (text.top - stage.top) / stage.height,
          width: text.width / stage.width,
          height: text.height / stage.height,
        },
        textColor,
        passThreshold,
      ),
    );
  }, [pixels, position, textColor, passThreshold]);

  function moveTextTo(clientX: number, clientY: number) {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage || stage.width === 0 || stage.height === 0) return;
    setPosition({
      x: clamp01((clientX - stage.left) / stage.width),
      y: clamp01((clientY - stage.top) / stage.height),
    });
  }

  const textColorOptions = [
    ...ALWAYS_AVAILABLE_TEXT_COLORS,
    ...paletteColors.filter(
      (hex) => !ALWAYS_AVAILABLE_TEXT_COLORS.includes(hex.toLowerCase()),
    ),
  ];

  if (!imageUrl) {
    return (
      <ToolWidth className="flex flex-col gap-3 p-4">
        {error && (
          <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-black/10 px-3 py-6 dark:border-white/10">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-brand-500 dark:border-zinc-600" />
            <span className="text-[11px] font-medium text-zinc-500">
              Reading image…
            </span>
          </div>
        ) : (
          <ImageDropZone
            title="Drop a screenshot, click to browse, or paste"
            subtitle="Check whether text stays readable on top of it"
            onFile={handleFile}
          />
        )}
      </ToolWidth>
    );
  }

  const verdict = stats ? wcagLevel(stats.min, isLargeText) : null;
  const passes = verdict !== null && verdict !== "fail";

  return (
    <ToolColumns className="p-4">
      {/* touch-none so dragging on a touchscreen moves the text instead of scrolling the panel. */}
      <div
        ref={stageRef}
        onPointerDown={(e) => {
          isDraggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTextTo(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (isDraggingRef.current) moveTextTo(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          isDraggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        className="relative touch-none select-none overflow-hidden rounded-lg border border-black/10 dark:border-white/10"
      >
        <img src={imageUrl} alt="" className="block w-full" draggable={false} />
        <span
          ref={textRef}
          className="-translate-x-1/2 -translate-y-1/2 absolute whitespace-nowrap"
          style={{
            left: `${position.x * 100}%`,
            top: `${position.y * 100}%`,
            color: textColor,
            fontSize: size.px,
            fontWeight: size.weight,
            lineHeight: 1.2,
          }}
        >
          {SAMPLE_TEXT}
        </span>
      </div>
      <p className="-mt-2 text-[11px] text-zinc-500">
        Drag anywhere on the image to move the text.
      </p>

      {stats && (
        <div className="flex flex-col gap-2">
          <div
            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 ${
              passes
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-red-500/15 text-red-700 dark:text-red-400"
            }`}
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-semibold text-sm">
                {passes ? `Passes ${verdict}` : "Fails"}
              </span>
              <span className="text-[11px] opacity-80">
                Worst pixel under the text, needs {passThreshold}:1
              </span>
            </div>
            <span className="shrink-0 font-mono font-semibold text-lg">
              {stats.min.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Worst" value={`${stats.min.toFixed(2)}:1`} emphasis />
            <Stat label="Average" value={`${stats.average.toFixed(2)}:1`} />
            <Stat label="Best" value={`${stats.max.toFixed(2)}:1`} />
          </div>
          {stats.failingShare > 0 && (
            <p className="text-[11px] text-zinc-500">
              {`${Math.round(stats.failingShare * 100)}% of the area under the text falls below ${passThreshold}:1.`}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Text size
        </span>
        <div className="flex gap-1 clay-inset rounded-lg bg-zinc-100 p-1 dark:bg-surface-elevated">
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSizeId(preset.id)}
              className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition active:scale-95 ${
                sizeId === preset.id
                  ? "clay bg-white text-zinc-900 dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Text color
        </span>
        <div className="flex flex-wrap gap-1.5">
          {textColorOptions.map((hex, index) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: a segment is a position in the strip — the same hex can legitimately appear twice, and keying by it strands stale segments
              key={index}
              type="button"
              onClick={() => setTextColor(hex)}
              title={hex}
              style={{ backgroundColor: hex }}
              className={`h-7 w-7 cursor-pointer rounded-md border transition active:scale-90 ${
                textColor === hex
                  ? "border-brand-500 ring-2 ring-brand-500"
                  : "border-black/20 dark:border-white/20"
              }`}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={clearImage}
        className="cursor-pointer self-start rounded-md border border-black/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
      >
        Use a different image
      </button>
    </ToolColumns>
  );
}
