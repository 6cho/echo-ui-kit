import { useState } from "react";
import { ContrastGrid } from "./ContrastGrid";
import { ImageContrastChecker } from "./ImageContrastChecker";

type ContrastMode = "palette" | "image";

/**
 * The two different questions "is this readable" can mean, under one tool.
 *
 * "Palette" answers it between two flat colors — a solved, exact problem with one number per
 * pair. "On image" answers it against a real screenshot, where the background varies per pixel
 * and there's no single number at all. They share the vocabulary (WCAG ratios and levels) but
 * nothing else, which is why they're modes rather than one merged view.
 */
export function ContrastView({ colors }: { colors: string[] }) {
  const [mode, setMode] = useState<ContrastMode>("palette");

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-surface-elevated">
          {(
            [
              { id: "palette", label: "Palette pairs" },
              { id: "image", label: "On image" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex-1 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition active:scale-95 ${
                mode === id
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Both stay mounted — switching to the palette matrix and back shouldn't throw away a
          loaded screenshot and the text position you'd dialed in on it. */}
      <div className={mode === "palette" ? "" : "hidden"}>
        <ContrastGrid colors={colors} />
      </div>
      <div className={mode === "image" ? "" : "hidden"}>
        <ImageContrastChecker paletteColors={colors} />
      </div>
    </div>
  );
}
