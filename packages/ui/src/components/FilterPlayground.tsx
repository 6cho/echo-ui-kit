import {
  FILTER_FUNCTIONS,
  type FilterValues,
  formatFilter,
  formatFilterCss,
  NEUTRAL_FILTER,
} from "@echo-ui-kit/tools-core";
import { useEffect, useMemo, useState } from "react";
import { CssOutput } from "./CssOutput";
import { ImageDropZone } from "./ImageDropZone";
import { Slider } from "./Slider";

export function FilterPlayground({
  paletteColors,
}: {
  paletteColors: string[];
}) {
  const [values, setValues] = useState<FilterValues>(NEUTRAL_FILTER);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const filter = useMemo(() => formatFilter(values), [values]);
  const css = useMemo(() => formatFilterCss(values), [values]);
  const isNeutral = filter === "none";

  useEffect(() => {
    return () => {
      setImageUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, []);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setImageUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
  }

  function clearImage() {
    setImageUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }

  // The stand-in when no image is loaded. Built from the working palette so the preview shows the
  // filter acting on colors you're actually using — a generic stock gradient would tell you less.
  const swatches =
    paletteColors.length > 0
      ? paletteColors
      : ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="block max-h-56 w-full object-cover"
            style={{ filter }}
          />
        ) : (
          <div style={{ filter }}>
            <div className="flex h-24">
              {swatches.map((hex) => (
                <div
                  key={hex}
                  className="min-w-0 flex-1"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 dark:bg-zinc-800">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Sample text
              </span>
              <span className="text-xs text-zinc-500">
                Drop an image to use your own
              </span>
            </div>
          </div>
        )}
      </div>

      {imageUrl ? (
        <button
          type="button"
          onClick={clearImage}
          className="cursor-pointer self-start rounded-md border border-black/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
        >
          Use the palette preview
        </button>
      ) : (
        <ImageDropZone
          title="Drop an image, click to browse, or paste"
          subtitle="Filters preview against it instead of the palette"
          onFile={handleFile}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Filters
        </span>
        <button
          type="button"
          onClick={() => setValues(NEUTRAL_FILTER)}
          disabled={isNeutral}
          title="Reset every filter to its neutral value"
          className="cursor-pointer rounded-full border border-zinc-300 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-surface-hover"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {FILTER_FUNCTIONS.map((spec) => (
          <Slider
            key={spec.key}
            label={spec.label}
            value={values[spec.key]}
            min={spec.min}
            max={spec.max}
            step={1}
            displayValue={`${values[spec.key]}${spec.unit}`}
            onChange={(next) =>
              setValues((current) => ({ ...current, [spec.key]: next }))
            }
          />
        ))}
      </div>

      <CssOutput code={css} />
    </div>
  );
}
