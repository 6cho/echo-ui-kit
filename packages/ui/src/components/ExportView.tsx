import {
  buildPaletteTokens,
  EXPORT_FORMATS,
  type ExportFormat,
  formatPaletteTokens,
} from "@echo-ui-kit/tools-core";
import { useMemo, useState } from "react";
import { ToolColumns } from "./ToolColumns";

/**
 * Turns the working palette into copy-pasteable tokens. This is the step that makes everything
 * upstream actually usable in a project — a palette you can only look at inside the side panel
 * isn't worth much.
 *
 * Exports two layers, not one: the full 100–900 ramp for every color in the scheme, plus
 * role-named aliases (`primary-500`, `accent-700`) pointing at the steps actually selected. The
 * ramps cover the shades you didn't pick but will need the first time you write a hover state;
 * the aliases record which color is doing which job, which the ramps can't say.
 */
export function ExportView({
  colors,
  baseColors,
}: {
  colors: string[];
  /** The scheme's columns, in role order — column 0 becomes `primary`, and each expands to its
   *  own full ramp. */
  baseColors: string[];
}) {
  const [format, setFormat] = useState<ExportFormat>("css");
  const [copied, setCopied] = useState(false);

  const tokens = useMemo(
    () => buildPaletteTokens(baseColors, colors),
    [baseColors, colors],
  );
  const code = useMemo(
    () => formatPaletteTokens(tokens, format),
    [tokens, format],
  );

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy failed", error);
    }
  }

  if (colors.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Nothing to export yet
        </p>
        <p className="max-w-[220px] text-xs text-zinc-500">
          Build a palette in the Palette tool and it'll show up here as CSS,
          Tailwind, SCSS, or JSON.
        </p>
      </div>
    );
  }

  const scaleTokenCount = tokens.scales.reduce(
    (total, scale) => total + scale.steps.length,
    0,
  );

  return (
    <ToolColumns className="p-4">
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-surface-elevated">
        {EXPORT_FORMATS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFormat(id)}
            className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition active:scale-95 ${
              format === id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {`${scaleTokenCount} scale · ${tokens.aliases.length} palette`}
          </span>
          <button
            type="button"
            onClick={copyToClipboard}
            title="Copy to clipboard"
            className="shrink-0 cursor-pointer rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {/* overflow-x-auto on the <pre> itself, not a wrapper — long hex lines shouldn't wrap
            (that would misrepresent the code you're copying) but they also can't be allowed to
            widen the panel. */}
        <pre className="max-h-72 overflow-auto rounded-lg border border-black/10 bg-zinc-100 p-3 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-200">
          {code}
        </pre>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Palette names
        </span>
        <div className="flex flex-col gap-1">
          {tokens.aliases.map((alias) => (
            <div
              key={alias.name}
              className="flex items-center gap-2 rounded-md border border-black/10 px-2 py-1 dark:border-white/10"
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/10"
                style={{ backgroundColor: alias.hex }}
              />
              <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                {alias.name}
              </span>
              {alias.scaleName && (
                <span className="ml-auto truncate font-mono text-[11px] text-zinc-500">
                  {`${alias.scaleName}-${alias.step}`}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </ToolColumns>
  );
}
