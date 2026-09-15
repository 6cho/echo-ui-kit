import {
  formatBoxShadow,
  formatShadowLayer,
  formatShadowMarkup,
  formatShadowStylesheet,
  INNER_SHADOW_PRESETS,
  OUTER_SHADOW_PRESETS,
  type ShadowLayer,
  type ShadowPreset,
} from "@echo-ui-kit/tools-core";
import { useMemo, useRef, useState } from "react";
import { useDismissable } from "../lib/useDismissable";
import { Slider } from "./Slider";
import { ThreeDotMenu } from "./ThreeDotMenu";

// Dragging past these stops feeling like adjusting a shadow and starts feeling like moving a
// second object, so the drag clamps here rather than running away with the pointer.
const MAX_OFFSET = 100;
const MAX_BLUR = 150;
const MIN_SPREAD = -50;
const MAX_SPREAD = 100;

const DEFAULT_LAYER: ShadowLayer = {
  offsetX: 0,
  offsetY: 8,
  blur: 24,
  spread: -4,
  color: "#000000",
  opacity: 0.25,
  inset: false,
};

// Each added layer starts wider and fainter than a plain duplicate would, because that's the
// shape a realistic stacked shadow takes — a tight dark contact shadow with progressively
// softer, larger ones spreading beneath it.
function nextLayerFrom(previous: ShadowLayer): ShadowLayer {
  return {
    ...previous,
    offsetY: Math.min(MAX_OFFSET, Math.round(previous.offsetY * 2)),
    blur: Math.min(MAX_BLUR, Math.round(Math.max(previous.blur, 4) * 2)),
    opacity: Math.max(0.02, Number((previous.opacity * 0.6).toFixed(3))),
  };
}

// A neutral ramp spanning white to near-black, so the preview can be set up to match wherever
// the shadow is actually going to live. A shadow tuned on white can vanish entirely on a dark
// surface, which is the single easiest way to ship one that looks broken.
const SURFACE_COLORS = [
  "#ffffff",
  "#f4f4f5",
  "#e4e4e7",
  "#a1a1aa",
  "#3f3f46",
  "#18181b",
];

// The two setups worth one click, since almost every shadow is destined for one or the other.
// Departing from either is what the Backdrop and Foreground sections are for.
const SURFACE_PRESETS = {
  light: { backdrop: "#fafafa", foreground: "#ffffff" },
  dark: { backdrop: "#18181b", foreground: "#27272a" },
} as const;

type ShadowDirection = "outer" | "inner";

// Direction belongs to a *layer*, not to the shadow as a whole — a stack can legitimately mix an
// inset highlight with an outer drop shadow. So it's a per-layer control, and the only place a
// direction appears at the preset level is as the group a preset was picked from.
const LAYER_DIRECTION_OPTIONS = [
  { id: "outer", label: "Outer" },
  { id: "inner", label: "Inner" },
];

const DEFAULT_PRESET_VALUE = "outer:medium";

const OUTPUT_FORMATS = [
  { id: "css", label: "CSS" },
  { id: "html", label: "HTML" },
] as const;

type OutputFormat = (typeof OUTPUT_FORMATS)[number]["id"];

function presetsFor(direction: ShadowDirection): ShadowPreset[] {
  return direction === "inner" ? INNER_SHADOW_PRESETS : OUTER_SHADOW_PRESETS;
}

// One <select> value has to name both the group and the style, since "medium" alone is ambiguous
// now that both groups share style ids.
const PRESET_GROUPS = (["outer", "inner"] as const).map((direction) => ({
  label: direction === "outer" ? "Outer" : "Inner",
  options: presetsFor(direction).map((preset) => ({
    id: `${direction}:${preset.id}`,
    label: preset.label,
  })),
}));

function findPresetByValue(value: string): ShadowPreset | undefined {
  const [direction, styleId] = value.split(":");
  return presetsFor(direction as ShadowDirection).find(
    (preset) => preset.id === styleId,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** One preview surface as its own labelled section with its own dropdown. The trigger shows the
 *  current color and hex so the section reads correctly closed, which is most of the time.
 *  Laid out like the Shadow layers header — label left, control right. */
function SurfaceSection({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (hex: string) => void;
}) {
  const { isOpen, setIsOpen, ref } = useDismissable<HTMLDivElement>();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="relative shrink-0" ref={ref}>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-900 transition hover:bg-zinc-200 active:scale-95 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-100 dark:hover:bg-surface-hover"
        >
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-[11px]">{value}</span>
          <span className="text-[10px] text-zinc-500">▾</span>
        </button>

        {isOpen && (
          <div
            // Right-anchored because the trigger sits at the row's right edge and the popover is
            // wider than it; opening leftward is the only direction that stays on the panel.
            className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-black/10 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-surface-elevated"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {options.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onChange(hex)}
                  title={hex}
                  style={{ backgroundColor: hex }}
                  className={`h-6 w-6 cursor-pointer rounded-md border transition active:scale-90 ${
                    value.toLowerCase() === hex.toLowerCase()
                      ? "border-brand-500 ring-2 ring-brand-500"
                      : "border-black/20 dark:border-white/20"
                  }`}
                />
              ))}
              <input
                type="color"
                aria-label={`${label} color`}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                title="Pick any color"
                className="h-6 w-6 shrink-0 cursor-pointer rounded-md border border-black/20 dark:border-white/20"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Styled to match the harmony picker in the palette tool, so the app has one look for "choose
 *  one of these" rather than a different control per screen. */
function PresetSelect({
  label,
  value,
  title,
  options,
  groups,
  onChange,
}: {
  label: string;
  value: string;
  title?: string;
  options?: { id: string; label: string }[];
  /** Renders as <optgroup>s. Used for presets, where the same five style names exist under both
   *  directions and a flat list would show "Small" twice with nothing to tell them apart. */
  groups?: { label: string; options: { id: string; label: string }[] }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          title={title}
          onChange={(e) => onChange(e.target.value)}
          className="w-full cursor-pointer appearance-none rounded-lg border border-black/10 bg-zinc-100 py-1.5 pr-8 pl-2.5 text-xs font-medium text-zinc-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-100"
        >
          {groups
            ? groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))
            : options?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
        </select>
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-zinc-500">
          ▾
        </span>
      </div>
    </div>
  );
}

function SwatchRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            title={hex}
            style={{ backgroundColor: hex }}
            className={`h-7 w-7 cursor-pointer rounded-md border transition active:scale-90 ${
              value === hex
                ? "border-brand-500 ring-2 ring-brand-500"
                : "border-black/20 dark:border-white/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A box-shadow editor whose primary control is the preview itself — drag the card and the shadow
 * follows your pointer, which is a far more direct way to answer "where do I want the light
 * coming from" than nudging two numeric offset fields and re-reading the result each time.
 *
 * Supports stacked layers because a single shadow can't produce the soft, realistic depth that
 * real interfaces use; the value of this tool over hand-writing CSS is mostly in seeing several
 * layers composite live.
 */
export function ShadowGenerator({
  paletteColors,
  libraryColors = [],
}: {
  /** The palette currently being built — offered as shadow colors. */
  paletteColors: string[];
  /** Every color already in the saved library, offered as preview surfaces so the backdrop can
   *  stand in for a real screen rather than a generic gray. */
  libraryColors?: string[];
}) {
  const [presetValue, setPresetValue] = useState(DEFAULT_PRESET_VALUE);
  // Seeded from the default preset rather than an arbitrary layer, so the two dropdowns describe
  // what's actually on screen from the very first render instead of naming a preset that hasn't
  // been applied yet.
  const [layers, setLayers] = useState<ShadowLayer[]>(
    () =>
      findPresetByValue(DEFAULT_PRESET_VALUE)?.layers.map((l) => ({
        ...l,
      })) ?? [DEFAULT_LAYER],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Explicit <string> because SURFACE_PRESETS is `as const` — inference would otherwise pin this
  // state to the literal type "#fafafa" and reject every other color.
  const [backdropColor, setBackdropColor] = useState<string>(
    SURFACE_PRESETS.light.backdrop,
  );
  const [foregroundColor, setForegroundColor] = useState<string>(
    SURFACE_PRESETS.light.foreground,
  );
  const [copied, setCopied] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("css");

  // Captures where the pointer and the offsets *started* so the drag applies a delta. Tracking
  // absolute pointer position instead would teleport the shadow to wherever you first clicked.
  const dragOriginRef = useRef<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const selected = layers[selectedIndex] ?? (layers[0] as ShadowLayer);
  const shadowValue = useMemo(() => formatBoxShadow(layers), [layers]);
  // Two halves of one demo rather than two takes on the same snippet: paste the markup in one
  // pane, the stylesheet in the other, and you get back exactly what the preview is showing.
  const output = useMemo(
    () =>
      outputFormat === "html"
        ? formatShadowMarkup()
        : formatShadowStylesheet(layers, foregroundColor, backdropColor),
    [layers, outputFormat, foregroundColor, backdropColor],
  );

  function updateSelected(patch: Partial<ShadowLayer>) {
    setLayers((current) =>
      current.map((layer, i) =>
        i === selectedIndex ? { ...layer, ...patch } : layer,
      ),
    );
  }

  function addLayer() {
    setLayers((current) => {
      const source = current[current.length - 1] ?? DEFAULT_LAYER;
      return [...current, nextLayerFrom(source)];
    });
    setSelectedIndex(layers.length);
  }

  function removeSelected() {
    if (layers.length === 1) return;
    setLayers((current) => current.filter((_, i) => i !== selectedIndex));
    setSelectedIndex((i) => Math.max(0, i - 1));
  }

  // Keeps whatever shadow color is currently picked rather than forcing the preset's black —
  // a preset is a statement about the shadow's *shape*, and silently throwing away a deliberate
  // color choice every time you try a different size would be annoying.
  function applyPreset(value: string) {
    setPresetValue(value);
    const preset = findPresetByValue(value);
    if (!preset) return;
    setLayers(preset.layers.map((l) => ({ ...l, color: selected.color })));
    setSelectedIndex(0);
  }

  function applySurfacePreset(preset: {
    backdrop: string;
    foreground: string;
  }) {
    setBackdropColor(preset.backdrop);
    setForegroundColor(preset.foreground);
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy failed", error);
    }
  }

  const colorOptions = [
    "#000000",
    ...paletteColors.filter((hex) => hex.toLowerCase() !== "#000000"),
  ];

  // Your own colors are offered for the surfaces too, not just the shadow — the most useful
  // preview is the one standing in for the actual screen this shadow is headed for, which is
  // rarely a neutral gray. Deduped because the working palette and the saved library overlap
  // heavily by design.
  const surfaceOptions = [
    ...new Set([
      ...SURFACE_COLORS,
      ...paletteColors.map((hex) => hex.toLowerCase()),
      ...libraryColors.map((hex) => hex.toLowerCase()),
    ]),
  ];

  const activeSurfacePreset = (
    Object.keys(SURFACE_PRESETS) as (keyof typeof SURFACE_PRESETS)[]
  ).find(
    (key) =>
      SURFACE_PRESETS[key].backdrop === backdropColor &&
      SURFACE_PRESETS[key].foreground === foregroundColor,
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div
        onPointerDown={(e) => {
          dragOriginRef.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            offsetX: selected.offsetX,
            offsetY: selected.offsetY,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const origin = dragOriginRef.current;
          if (!origin) return;
          updateSelected({
            offsetX: clamp(
              Math.round(origin.offsetX + (e.clientX - origin.pointerX)),
              -MAX_OFFSET,
              MAX_OFFSET,
            ),
            offsetY: clamp(
              Math.round(origin.offsetY + (e.clientY - origin.pointerY)),
              -MAX_OFFSET,
              MAX_OFFSET,
            ),
          });
        }}
        onPointerUp={(e) => {
          dragOriginRef.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        style={{ backgroundColor: backdropColor }}
        className="flex h-52 cursor-grab touch-none select-none items-center justify-center rounded-lg border border-black/10 active:cursor-grabbing dark:border-white/10"
      >
        <div
          className="h-20 w-28 rounded-xl"
          style={{ backgroundColor: foregroundColor, boxShadow: shadowValue }}
        />
      </div>
      <p className="-mt-2 text-[11px] text-zinc-500">
        Drag the preview to move the shadow.
      </p>

      {/* Sets both sections at once, since "light UI or dark UI" is one decision far more often
          than it's two. The sections below are for departing from it. */}
      <div className="flex gap-1 self-start rounded-md bg-zinc-100 p-0.5 dark:bg-surface-elevated">
        {(["light", "dark"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => applySurfacePreset(SURFACE_PRESETS[key])}
            className={`cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium capitalize transition active:scale-95 ${
              activeSurfacePreset === key
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <SurfaceSection
          label="Backdrop"
          value={backdropColor}
          options={surfaceOptions}
          onChange={setBackdropColor}
        />
        <SurfaceSection
          label="Foreground"
          value={foregroundColor}
          options={surfaceOptions}
          onChange={setForegroundColor}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {`Shadow layers (${layers.length})`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={addLayer}
              className="cursor-pointer rounded-md border border-black/10 px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
            >
              Add layer
            </button>
            {layers.length > 1 && (
              <ThreeDotMenu
                items={[
                  {
                    label: "Delete layer",
                    onSelect: removeSelected,
                    destructive: true,
                  },
                ]}
              />
            )}
          </div>
        </div>
        {layers.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {layers.map((layer, i) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: layer order is the CSS value's own order, and a layer has no identity beyond its position in it
                key={`layer-${i}`}
                type="button"
                onClick={() => setSelectedIndex(i)}
                // The full CSS on hover, since the label can only carry the two things worth
                // telling layers apart at a glance — their order, and which way each one faces.
                title={formatShadowLayer(layer)}
                className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-medium transition active:scale-95 ${
                  i === selectedIndex
                    ? "border-brand-500 text-brand-600 dark:text-brand-500"
                    : "border-black/10 text-zinc-500 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-surface-elevated"
                }`}
              >
                {`${i + 1}. ${layer.inset ? "Inner" : "Outer"}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The layer picker sits above this box; everything inside it acts on the layer that picker
          has selected — except Preset, which seeds the whole stack. That's the one scope
          difference here, so it carries a tooltip saying so rather than relying on its label. */}
      <div className="flex flex-col gap-2.5 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {layers.length > 1
            ? `Layer ${selectedIndex + 1} of ${layers.length}`
            : "Layer"}
        </span>

        <div className="flex items-end gap-2">
          <PresetSelect
            label="Preset"
            title="Replaces every layer with this preset"
            value={presetValue}
            groups={PRESET_GROUPS}
            onChange={applyPreset}
          />
          <PresetSelect
            label="Direction"
            title="Applies to the selected layer only"
            value={selected.inset ? "inner" : "outer"}
            options={LAYER_DIRECTION_OPTIONS}
            onChange={(id) => updateSelected({ inset: id === "inner" })}
          />
        </div>

        <Slider
          label="Offset X"
          value={selected.offsetX}
          min={-MAX_OFFSET}
          max={MAX_OFFSET}
          step={1}
          displayValue={`${selected.offsetX}px`}
          onChange={(offsetX) => updateSelected({ offsetX })}
        />
        <Slider
          label="Offset Y"
          value={selected.offsetY}
          min={-MAX_OFFSET}
          max={MAX_OFFSET}
          step={1}
          displayValue={`${selected.offsetY}px`}
          onChange={(offsetY) => updateSelected({ offsetY })}
        />
        <Slider
          label="Blur"
          value={selected.blur}
          min={0}
          max={MAX_BLUR}
          step={1}
          displayValue={`${selected.blur}px`}
          onChange={(blur) => updateSelected({ blur })}
        />
        <Slider
          label="Spread"
          value={selected.spread}
          min={MIN_SPREAD}
          max={MAX_SPREAD}
          step={1}
          displayValue={`${selected.spread}px`}
          onChange={(spread) => updateSelected({ spread })}
        />
        <Slider
          label="Opacity"
          value={Math.round(selected.opacity * 100)}
          min={0}
          max={100}
          step={1}
          displayValue={`${Math.round(selected.opacity * 100)}%`}
          thumbColor={selected.color}
          onChange={(percent) => updateSelected({ opacity: percent / 100 })}
        />

        <SwatchRow
          label="Shadow color"
          options={colorOptions}
          value={selected.color}
          onChange={(color) => updateSelected({ color })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5 dark:bg-surface-elevated">
            {OUTPUT_FORMATS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setOutputFormat(id)}
                className={`cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition active:scale-95 ${
                  outputFormat === id
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={copyToClipboard}
            title="Copy to clipboard"
            className="shrink-0 cursor-pointer rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-black/10 bg-zinc-100 p-3 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-200">
          {output}
        </pre>
      </div>
    </div>
  );
}
