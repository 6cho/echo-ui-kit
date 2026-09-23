import {
  contrastRatio,
  formatThemeCss,
  suggestThemePair,
  THEME_ROLES,
  type ThemeMapping,
  type ThemePair,
  type ThemeRoleId,
  wcagLevel,
} from "@echo-ui-kit/tools-core";
import { useEffect, useMemo, useState } from "react";
import { ColorStrip } from "./ColorStrip";
import { CssOutput } from "./CssOutput";
import { ToolColumns } from "./ToolColumns";

type Mode = "light" | "dark";

/** A miniature interface painted entirely from a mapping. Abstract on purpose — enough shape to
 *  judge the colors against each other, not a mockup of any particular screen. */
function Preview({ mapping, label }: { mapping: ThemeMapping; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div
        className="flex flex-col gap-2 rounded-lg border border-black/10 p-3 dark:border-white/10"
        style={{ backgroundColor: mapping.background }}
      >
        <div
          className="flex flex-col gap-2 rounded-md border p-2.5"
          style={{
            backgroundColor: mapping.surface,
            borderColor: mapping.border,
          }}
        >
          <span
            className="text-xs font-semibold"
            style={{ color: mapping.text }}
          >
            Card heading
          </span>
          <span className="text-[11px]" style={{ color: mapping.muted }}>
            Secondary copy that sits underneath it.
          </span>
          <div className="flex items-center gap-1.5 pt-0.5">
            <span
              className="rounded px-2 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: mapping.primary,
                color: mapping.onPrimary,
              }}
            >
              Primary
            </span>
            <span
              className="rounded border px-2 py-1 text-[11px] font-medium"
              style={{ borderColor: mapping.border, color: mapping.text }}
            >
              Secondary
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Builds a light and a dark theme out of a palette, and shows both at once.
 *
 * Having the two side by side is the point. A dark theme is not a light theme with the lightness
 * inverted — the accent that carried enough contrast on white often doesn't on near-black, and
 * the only way to catch that is to look at them together rather than toggling back and forth and
 * trusting your memory of what you just saw.
 */
export function ThemeTester({ paletteColors }: { paletteColors: string[] }) {
  const [pair, setPair] = useState<ThemePair>(() =>
    suggestThemePair(paletteColors),
  );
  const [mode, setMode] = useState<Mode>("light");
  const [role, setRole] = useState<ThemeRoleId>("primary");

  // Re-proposed whenever the palette itself changes, because a mapping onto colors that are no
  // longer in the palette isn't a theme anyone wants to keep editing.
  const paletteKey = paletteColors.join(",");
  useEffect(() => {
    setPair(suggestThemePair(paletteKey ? paletteKey.split(",") : []));
  }, [paletteKey]);

  const css = useMemo(() => formatThemeCss(pair), [pair]);

  // Every role that carries text, checked against whatever it sits on, in both modes at once —
  // the failure this tool exists to catch is a pairing that only breaks in one of them.
  const warnings = useMemo(() => {
    const found: { mode: Mode; label: string; ratio: number }[] = [];
    for (const current of ["light", "dark"] as Mode[]) {
      const mapping = pair[current];
      for (const definition of THEME_ROLES) {
        if (!definition.against) continue;
        const ratio = contrastRatio(
          mapping[definition.id],
          mapping[definition.against],
        );
        if (wcagLevel(ratio) === "fail") {
          found.push({ mode: current, label: definition.label, ratio });
        }
      }
    }
    return found;
  }, [pair]);

  function assign(hex: string) {
    setPair((current) => ({
      ...current,
      [mode]: { ...current[mode], [role]: hex },
    }));
  }

  const options = [
    ...new Set([
      ...paletteColors.map((hex) => hex.toLowerCase()),
      "#ffffff",
      "#000000",
    ]),
  ];
  const activeRole = THEME_ROLES.find((r) => r.id === role);

  return (
    <ToolColumns className="p-4">
      <div className="flex gap-3">
        <Preview mapping={pair.light} label="Light" />
        <Preview mapping={pair.dark} label="Dark" />
      </div>

      {warnings.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg bg-red-500/10 px-3 py-2">
          {warnings.map((warning) => (
            <span
              key={`${warning.mode}-${warning.label}`}
              className="text-[11px] text-red-600 dark:text-red-400"
            >
              {`${warning.label} fails in ${warning.mode} mode — ${warning.ratio.toFixed(2)}:1`}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Editing
        </span>
        <div className="flex gap-1 clay-inset rounded-lg bg-zinc-100 p-1 dark:bg-surface-elevated">
          {(["light", "dark"] as Mode[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium capitalize transition active:scale-95 ${
                mode === id
                  ? "clay bg-white text-zinc-900 dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {THEME_ROLES.map((definition) => {
          const hex = pair[mode][definition.id];
          const isActive = definition.id === role;
          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => setRole(definition.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left transition ${
                isActive
                  ? "border-brand-500"
                  : "border-black/10 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-surface-elevated"
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/10"
                style={{ backgroundColor: hex }}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {definition.label}
                </span>
                <span className="truncate text-[11px] text-zinc-500">
                  {definition.hint}
                </span>
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">
                {hex}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-end gap-2">
        <ColorStrip
          label={`${activeRole?.label ?? "Role"} · ${mode}`}
          colors={options}
          value={pair[mode][role]}
          onChange={assign}
        />
        <input
          type="color"
          aria-label="Role color"
          value={pair[mode][role]}
          onChange={(e) => assign(e.target.value)}
          title="Pick any color"
          className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-black/20 dark:border-white/20"
        />
      </div>

      <button
        type="button"
        onClick={() => setPair(suggestThemePair(paletteColors))}
        className="cursor-pointer self-start rounded-full border border-zinc-300 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-surface-hover"
      >
        Re-suggest from palette
      </button>

      <CssOutput code={css} />
    </ToolColumns>
  );
}
