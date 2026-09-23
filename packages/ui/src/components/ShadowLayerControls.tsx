import {
  formatShadowLayer,
  INNER_SHADOW_PRESETS,
  OUTER_SHADOW_PRESETS,
  type ShadowLayer,
  type ShadowPreset,
} from "@echo-ui-kit/tools-core";
import { ColorStrip } from "./ColorStrip";
import { Slider } from "./Slider";
import { ThreeDotMenu } from "./ThreeDotMenu";

// Dragging past these stops feeling like adjusting a shadow and starts feeling like moving a
// second object, so the drag clamps here rather than running away with the pointer.
export const MAX_SHADOW_OFFSET = 100;
const MAX_BLUR = 150;
const MIN_SPREAD = -50;
const MAX_SPREAD = 100;

type ShadowDirection = "outer" | "inner";

// Direction belongs to a *layer*, not to the shadow as a whole — a stack can legitimately mix an
// inset highlight with an outer drop shadow.
const LAYER_DIRECTION_OPTIONS = [
  { id: "outer", label: "Outer" },
  { id: "inner", label: "Inner" },
];

export const DEFAULT_PRESET_VALUE = "outer:medium";

function presetsFor(direction: ShadowDirection): ShadowPreset[] {
  return direction === "inner" ? INNER_SHADOW_PRESETS : OUTER_SHADOW_PRESETS;
}

// One <select> value has to name both the group and the style, since both groups share style ids.
export const SHADOW_PRESET_GROUPS = (["outer", "inner"] as const).map(
  (direction) => ({
    label: direction === "outer" ? "Outer" : "Inner",
    options: presetsFor(direction).map((preset) => ({
      id: `${direction}:${preset.id}`,
      label: preset.label,
    })),
  }),
);

export function findPresetByValue(value: string): ShadowPreset | undefined {
  const [direction, styleId] = value.split(":");
  return presetsFor(direction as ShadowDirection).find(
    (preset) => preset.id === styleId,
  );
}

// Each added layer starts wider and fainter than a plain duplicate would, because that's the
// shape a realistic stacked shadow takes — a tight contact shadow with progressively softer,
// larger ones spreading beneath it.
export function nextLayerFrom(previous: ShadowLayer): ShadowLayer {
  return {
    ...previous,
    offsetY: Math.min(MAX_SHADOW_OFFSET, Math.round(previous.offsetY * 2)),
    blur: Math.min(MAX_BLUR, Math.round(Math.max(previous.blur, 4) * 2)),
    opacity: Math.max(0.02, Number((previous.opacity * 0.6).toFixed(3))),
  };
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
          className="clay-inset w-full cursor-pointer appearance-none rounded-lg bg-zinc-100 py-1.5 pr-8 pl-2.5 text-xs font-medium text-zinc-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-100"
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

/** The whole shadow-stack editor: the layer list, a preset picker, and every property of the
 *  selected layer. Offsets are included even though they're also draggable on the preview —
 *  dragging is how you find a direction, the sliders are how you land on a round number. */
export function ShadowLayerControls({
  layers,
  selectedIndex,
  presetValue,
  colorOptions,
  onSelectLayer,
  onChangeLayers,
  onChangePreset,
}: {
  layers: ShadowLayer[];
  selectedIndex: number;
  presetValue: string;
  colorOptions: string[];
  onSelectLayer: (index: number) => void;
  onChangeLayers: (layers: ShadowLayer[]) => void;
  onChangePreset: (value: string) => void;
}) {
  const selected = layers[selectedIndex] ?? (layers[0] as ShadowLayer);

  function updateSelected(patch: Partial<ShadowLayer>) {
    onChangeLayers(
      layers.map((layer, i) =>
        i === selectedIndex ? { ...layer, ...patch } : layer,
      ),
    );
  }

  function addLayer() {
    const source = layers[layers.length - 1] ?? selected;
    onChangeLayers([...layers, nextLayerFrom(source)]);
    onSelectLayer(layers.length);
  }

  function removeSelected() {
    if (layers.length === 1) return;
    onChangeLayers(layers.filter((_, i) => i !== selectedIndex));
    onSelectLayer(Math.max(0, selectedIndex - 1));
  }

  function applyPreset(value: string) {
    onChangePreset(value);
    const preset = findPresetByValue(value);
    if (!preset) return;
    // Keeps whatever shadow color is currently picked rather than forcing the preset's black — a
    // preset is a statement about the shadow's *shape*, and silently discarding a deliberate
    // color choice every time you try a different size would be irritating.
    onChangeLayers(preset.layers.map((l) => ({ ...l, color: selected.color })));
    onSelectLayer(0);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {`Layers (${layers.length})`}
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
              onClick={() => onSelectLayer(i)}
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

      <div className="flex items-end gap-2">
        <PresetSelect
          label="Preset"
          title="Replaces every layer with this preset"
          value={presetValue}
          groups={SHADOW_PRESET_GROUPS}
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
        min={-MAX_SHADOW_OFFSET}
        max={MAX_SHADOW_OFFSET}
        step={1}
        displayValue={`${selected.offsetX}px`}
        onChange={(offsetX) => updateSelected({ offsetX })}
      />
      <Slider
        label="Offset Y"
        value={selected.offsetY}
        min={-MAX_SHADOW_OFFSET}
        max={MAX_SHADOW_OFFSET}
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

      <div className="flex items-end gap-2">
        <ColorStrip
          label="Shadow color"
          colors={colorOptions}
          value={selected.color}
          onChange={(color) => updateSelected({ color })}
        />
        <input
          type="color"
          aria-label="Shadow color"
          value={selected.color}
          onChange={(e) => updateSelected({ color: e.target.value })}
          title="Pick any color"
          className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-black/20 dark:border-white/20"
        />
      </div>
    </>
  );
}
