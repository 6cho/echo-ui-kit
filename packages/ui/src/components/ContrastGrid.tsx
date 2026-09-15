import {
  contrastRatio,
  type WcagLevel,
  wcagLevel,
} from "@echo-ui-kit/tools-core";
import { useMemo, useState } from "react";

// WCAG 2 thresholds, named so the chips below read as what they test rather than as bare
// numbers. AA_LARGE is the 18pt+/14pt-bold allowance, which is why a pair can clear it while
// still failing for body copy.
const AA_LARGE = 3;
const AA_NORMAL = 4.5;
const AAA_NORMAL = 7;

const VERDICT_LABELS: Record<WcagLevel, string> = {
  fail: "Fail",
  "AA-large": "AA Large",
  AA: "AA",
  AAA: "AAA",
};

// Every ordered pair, not just the upper triangle — contrast is symmetric as a *ratio*, but
// "white text on blue" and "blue text on white" are different design decisions, and seeing both
// rendered is the whole point of a grid you can read at a glance.
interface Pair {
  foreground: string;
  background: string;
  ratio: number;
}

function levelChipClass(passes: boolean): string {
  return passes
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-red-500/15 text-red-700 dark:text-red-400";
}

function LevelChip({ label, passes }: { label: string; passes: boolean }) {
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 ${levelChipClass(passes)}`}
    >
      <span className="font-semibold text-[11px]">{label}</span>
      <span className="text-[10px] opacity-80">{passes ? "Pass" : "Fail"}</span>
    </div>
  );
}

/**
 * Scores every foreground/background pair in the palette at once. The matrix is the overview —
 * each cell literally renders sample text in one color on another, so a failing pair *looks*
 * unreadable rather than just reporting a number you have to interpret. Clicking a cell opens
 * the detail card, which is where the actual WCAG thresholds live.
 *
 * Grid cells stay deliberately small and label-free: with up to 16 colors that's 256 cells, and
 * anything more than a glyph per cell stops fitting in a side panel. The readable numbers belong
 * in the detail view, not repeated 256 times.
 */
export function ContrastGrid({ colors }: { colors: string[] }) {
  const [selected, setSelected] = useState<Pair | null>(null);

  const rows = useMemo(
    () =>
      colors.map((background) =>
        colors.map((foreground) => ({
          foreground,
          background,
          ratio: contrastRatio(foreground, background),
        })),
      ),
    [colors],
  );

  // Picks the best real pair as the initial detail, rather than defaulting to the top-left cell —
  // which is always a color against itself (a 1:1 ratio), i.e. the single least useful pair in
  // the whole grid and a confusing thing to land on.
  const bestPair = useMemo(() => {
    let best: Pair | null = null;
    for (const row of rows) {
      for (const pair of row) {
        if (pair.foreground === pair.background) continue;
        if (!best || pair.ratio > best.ratio) best = pair;
      }
    }
    return best;
  }, [rows]);

  const detail = selected ?? bestPair;

  if (colors.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No palette to check
        </p>
        <p className="max-w-[220px] text-xs text-zinc-500">
          Build a palette in the Palette tool and its colors will be scored
          against each other here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Every pair
        </span>
        <p className="text-[11px] text-zinc-500">
          Rows are backgrounds, columns are text. Tap any cell for its score.
        </p>
        {/* Scrolls on its own rather than letting the page scroll sideways — at 16 colors the
            grid can exceed the panel width no matter how small the cells get. */}
        <div className="-mx-1 overflow-x-auto px-1 pt-1">
          <div className="flex w-max flex-col gap-0.5">
            {rows.map((row, rowIndex) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed matrix layout, rows never reorder within a render
                key={`row-${rowIndex}`}
                className="flex gap-0.5"
              >
                {row.map((pair, colIndex) => {
                  const isSelf = pair.foreground === pair.background;
                  const isSelected =
                    detail?.foreground === pair.foreground &&
                    detail?.background === pair.background;
                  return (
                    <button
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed matrix layout, cells never reorder within a render
                      key={`cell-${rowIndex}-${colIndex}`}
                      type="button"
                      onClick={() => setSelected(pair)}
                      title={`${pair.foreground} on ${pair.background} — ${pair.ratio.toFixed(2)}:1`}
                      style={{
                        backgroundColor: pair.background,
                        color: pair.foreground,
                      }}
                      className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[3px] font-semibold text-[10px] transition hover:brightness-110 ${
                        isSelected
                          ? "ring-2 ring-brand-500 ring-offset-1 ring-offset-white dark:ring-offset-surface"
                          : ""
                      }`}
                    >
                      {isSelf ? "" : "Aa"}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {detail && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {selected ? "Selected pair" : "Best pair"}
          </span>
          <div
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-black/10 px-3 py-5 dark:border-white/10"
            style={{ backgroundColor: detail.background }}
          >
            <span
              className="font-semibold text-lg"
              style={{ color: detail.foreground }}
            >
              Large text
            </span>
            <span className="text-xs" style={{ color: detail.foreground }}>
              Body text at a normal size
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg border border-black/10 p-2 dark:border-white/10">
            <div className="flex min-w-0 flex-col">
              <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {detail.foreground} on {detail.background}
              </span>
              <span className="text-[11px] text-zinc-500">
                Contrast ratio {detail.ratio.toFixed(2)}:1
              </span>
            </div>
            <span
              className={`shrink-0 rounded-md px-2 py-1 font-semibold text-[11px] ${levelChipClass(
                wcagLevel(detail.ratio) !== "fail",
              )}`}
            >
              {VERDICT_LABELS[wcagLevel(detail.ratio)]}
            </span>
          </div>

          {/* The three thresholds that actually get cited in a review, rather than one overall
              verdict — a pair can be perfectly fine for a heading and unusable for body copy,
              and collapsing that into a single pass/fail hides the decision you need to make. */}
          <div className="grid grid-cols-3 gap-1.5">
            <LevelChip label="AA" passes={detail.ratio >= AA_NORMAL} />
            <LevelChip label="AA Large" passes={detail.ratio >= AA_LARGE} />
            <LevelChip label="AAA" passes={detail.ratio >= AAA_NORMAL} />
          </div>
        </div>
      )}
    </div>
  );
}
