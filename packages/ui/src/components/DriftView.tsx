import {
  analyzeDrift,
  type DriftCandidate,
  type DriftEntry,
  type DriftVerdict,
  parseColorList,
} from "@echo-ui-kit/tools-core";
import { useMemo, useState } from "react";
import type { SavedPalette } from "../types/palette";
import { CollapsibleSection } from "./CollapsibleSection";
import { ToolColumns } from "./ToolColumns";

const VERDICT_STYLE: Record<
  DriftVerdict,
  { label: string; className: string }
> = {
  near: {
    label: "Drifted",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  unmatched: {
    label: "Outside",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
  exact: {
    label: "Match",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
};

function Swatch({ hex }: { hex: string }) {
  return (
    <span
      className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/10"
      style={{ backgroundColor: hex }}
    />
  );
}

function EntryRow({ entry }: { entry: DriftEntry }) {
  const style = VERDICT_STYLE[entry.verdict];
  return (
    <div className="flex items-center gap-2 rounded-md border border-black/10 px-2 py-1.5 dark:border-white/10">
      <Swatch hex={entry.hex} />
      <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
        {entry.hex}
      </span>
      {/* The pairing is the whole point of a drifted row — showing what it should have been, next
          to what it is, at a size where the two look identical. That they look identical is the
          reason this class of mistake survives code review. */}
      {entry.verdict === "near" && entry.nearestHex && (
        <>
          <span className="text-[11px] text-zinc-400">→</span>
          <Swatch hex={entry.nearestHex} />
          <span className="font-mono text-[11px] text-zinc-500">
            {entry.nearestHex}
          </span>
        </>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {entry.usage !== undefined && (
          <span className="font-mono text-[11px] text-zinc-500">
            {`${entry.usage}×`}
          </span>
        )}
        <span
          className={`rounded px-1.5 py-0.5 font-medium text-[10px] ${style.className}`}
        >
          {style.label}
        </span>
      </span>
    </div>
  );
}

/**
 * Checks the colors actually in use against a palette you've saved.
 *
 * The output people care about is the middle category. Exact matches are fine and outright
 * strangers are obvious, but a color a hair off a palette entry looks identical to it at a glance
 * — which is exactly why those accumulate unnoticed until a design system is quietly thirty
 * greys wide.
 */
export function DriftView({
  palettes,
  pageCandidates,
  onScanPage,
  isScanning = false,
}: {
  /** Saved palettes, one of which acts as the reference to measure against. */
  palettes: SavedPalette[];
  /** Colors from the live page, when the host can read one. */
  pageCandidates?: DriftCandidate[];
  onScanPage?: () => void;
  isScanning?: boolean;
}) {
  const [paletteId, setPaletteId] = useState<string>("");
  const [pasted, setPasted] = useState("");
  // Which input the report describes. Tracked explicitly rather than inferred from whichever is
  // non-empty, so pasting something doesn't silently override a page scan you're still reading.
  const [source, setSource] = useState<"page" | "paste">(
    onScanPage ? "page" : "paste",
  );

  const reference = palettes.find((p) => p.id === paletteId) ?? palettes[0];

  const candidates = useMemo<DriftCandidate[]>(() => {
    if (source === "page") return pageCandidates ?? [];
    return parseColorList(pasted).map((hex) => ({ hex }));
  }, [source, pageCandidates, pasted]);

  const report = useMemo(
    () => analyzeDrift(candidates, reference?.colors ?? []),
    [candidates, reference],
  );

  if (palettes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Save a palette first
        </p>
        <p className="max-w-[240px] text-xs text-zinc-500">
          Drift is measured against a palette you've committed to. Save one from
          the Palette tool and it becomes the reference here.
        </p>
      </div>
    );
  }

  return (
    <ToolColumns className="p-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Measure against
        </span>
        <div className="relative">
          <select
            value={reference?.id ?? ""}
            onChange={(e) => setPaletteId(e.target.value)}
            className="w-full cursor-pointer appearance-none rounded-lg border border-black/10 bg-zinc-100 py-1.5 pr-8 pl-2.5 text-xs font-medium text-zinc-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-100"
          >
            {palettes.map((palette) => (
              <option key={palette.id} value={palette.id}>
                {`${palette.harmony.replace("-", " ")} · ${palette.colors.length} colors`}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-zinc-500">
            ▾
          </span>
        </div>
        {reference && (
          <div className="flex h-6 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
            {reference.colors.map((hex) => (
              <div
                key={hex}
                title={hex}
                className="min-w-0 flex-1"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Colors in use
        </span>
        {onScanPage && (
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-surface-elevated">
            {(["page", "paste"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSource(id)}
                className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition active:scale-95 ${
                  source === id
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {id === "page" ? "This page" : "Paste"}
              </button>
            ))}
          </div>
        )}

        {source === "page" && onScanPage ? (
          <button
            type="button"
            onClick={onScanPage}
            disabled={isScanning}
            className="cursor-pointer self-start rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isScanning ? "Scanning…" : "Rescan page"}
          </button>
        ) : (
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={4}
            placeholder="Paste CSS, a theme file, or a list of hex codes"
            className="w-full resize-y rounded-lg border border-black/10 bg-zinc-100 p-2 font-mono text-[11px] text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-brand-500 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-200"
          />
        )}
      </div>

      {candidates.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["near", report.near],
                ["unmatched", report.unmatched],
                ["exact", report.exact],
              ] as const
            ).map(([verdict, count]) => (
              <div
                key={verdict}
                className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 ${VERDICT_STYLE[verdict].className}`}
              >
                <span className="font-semibold text-sm">{count}</span>
                <span className="text-[10px] opacity-80">
                  {VERDICT_STYLE[verdict].label}
                </span>
              </div>
            ))}
          </div>

          {report.near > 0 && (
            <p className="text-[11px] text-zinc-500">
              {report.near === 1
                ? "1 color is a hair off a palette entry — almost always a hex retyped from memory."
                : `${report.near} colors are a hair off palette entries — almost always hexes retyped from memory.`}
            </p>
          )}

          <div className="flex flex-col gap-1">
            {report.entries.map((entry) => (
              <EntryRow key={entry.hex} entry={entry} />
            ))}
          </div>
        </>
      )}

      {candidates.length === 0 && source === "paste" && (
        <CollapsibleSection title="Nothing to check" summary="paste something">
          <p className="text-[11px] text-zinc-500">
            Hex codes and rgb() values are picked out of whatever you paste — it
            doesn't need to be valid CSS.
          </p>
        </CollapsibleSection>
      )}
    </ToolColumns>
  );
}
