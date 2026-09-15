import {
  type Fill,
  formatBoxMarkup,
  formatBoxShadow,
  formatBoxStylesheet,
  formatFill,
  formatRadius,
  RADIUS_CORNER_KEYS,
  RADIUS_CORNER_LABELS,
  type RadiusCorners,
  type RadiusUnit,
  type ShadowLayer,
  solidFill,
} from "@echo-ui-kit/tools-core";
import { useMemo, useRef, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { CssOutput } from "./CssOutput";
import {
  DEFAULT_PRESET_VALUE,
  findPresetByValue,
  MAX_SHADOW_OFFSET,
  ShadowLayerControls,
} from "./ShadowLayerControls";
import { Slider } from "./Slider";
import { SURFACE_PRESETS, SurfaceControls } from "./SurfaceControls";

const MAX_RADIUS_PX = 100;
const MAX_RADIUS_PERCENT = 50;

const INITIAL_SIZE = { width: 200, height: 140 };
const MIN_WIDTH = 60;
const MIN_HEIGHT = 48;
const MAX_WIDTH = 300;
const MAX_HEIGHT = 280;

// How far in from an edge still counts as grabbing that edge. Capped against the box's own
// dimensions so a small box doesn't end up all edge zone with no middle left to drag the shadow
// from.
const MAX_EDGE_ZONE = 32;

const DEFAULT_CORNERS: RadiusCorners = {
  topLeft: 12,
  topRight: 12,
  bottomRight: 12,
  bottomLeft: 12,
};

const LEFT_CORNERS: (keyof RadiusCorners)[] = ["topLeft", "bottomLeft"];
const TOP_CORNERS: (keyof RadiusCorners)[] = ["topLeft", "topRight"];

const OUTPUT_TABS = [
  { id: "css", label: "CSS" },
  { id: "html", label: "HTML" },
];

type Zone =
  | { kind: "radius"; corner: keyof RadiusCorners }
  | { kind: "resize"; axis: "x" | "y"; sign: 1 | -1 }
  | { kind: "shadow" }
  | null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cursorFor(zone: Zone): string {
  if (!zone) return "default";
  if (zone.kind === "radius") return "grab";
  if (zone.kind === "shadow") return "move";
  return zone.axis === "x" ? "ew-resize" : "ns-resize";
}

/**
 * Everything you can set on a single div, against one preview.
 *
 * Radius and shadow were separate tools that each kept a private copy of the same preview, the
 * same surface colors, and the same output block — while in practice they land on the same
 * element and ship in the same rule. Merging them means one combined declaration instead of two
 * you'd have to reconcile by hand, and it lets the three gestures share one shape: the middle of
 * the box was inert in the radius tool and is exactly what the shadow tool dragged.
 */
export function BoxEditor({
  paletteColors,
  libraryColors = [],
}: {
  paletteColors: string[];
  libraryColors?: string[];
}) {
  const [corners, setCorners] = useState<RadiusCorners>(DEFAULT_CORNERS);
  const [radiusUnit, setRadiusUnit] = useState<RadiusUnit>("px");
  const [linked, setLinked] = useState(true);
  const [size, setSize] = useState(INITIAL_SIZE);

  const [layers, setLayers] = useState<ShadowLayer[]>(
    () =>
      findPresetByValue(DEFAULT_PRESET_VALUE)?.layers.map((l) => ({ ...l })) ??
      [],
  );
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [presetValue, setPresetValue] = useState(DEFAULT_PRESET_VALUE);

  const [backdrop, setBackdrop] = useState<Fill>(() =>
    solidFill(SURFACE_PRESETS.light.backdrop),
  );
  const [foreground, setForeground] = useState<Fill>(() =>
    solidFill(SURFACE_PRESETS.light.foreground),
  );
  // What gets emitted. Radius and shadow are additive, so switching them off removes them from
  // the preview too — that's exactly what omitting the declaration looks like. Size and
  // background can't work that way: leaving them out means "whatever the real element already
  // has", which a preview has no way to show, so the preview keeps rendering them.
  const [enabled, setEnabled] = useState({
    size: true,
    foreground: true,
    radius: true,
    shadow: true,
  });
  const [outputTab, setOutputTab] = useState("css");
  const [cursor, setCursor] = useState("default");

  const boxRef = useRef<HTMLDivElement>(null);
  // What was grabbed and what it measured at the time, so every gesture applies a delta rather
  // than snapping to whatever value happened to sit under the cursor when you pressed.
  const dragRef = useRef<{
    zone: NonNullable<Zone>;
    startRadius: number;
    startWidth: number;
    startHeight: number;
    startOffsetX: number;
    startOffsetY: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  const maxRadius = radiusUnit === "px" ? MAX_RADIUS_PX : MAX_RADIUS_PERCENT;
  const radiusValue = useMemo(
    () => formatRadius(corners, radiusUnit),
    [corners, radiusUnit],
  );
  const shadowValue = useMemo(
    () => (enabled.shadow ? formatBoxShadow(layers) : "none"),
    [layers, enabled.shadow],
  );

  const output = useMemo(
    () =>
      outputTab === "html"
        ? formatBoxMarkup()
        : formatBoxStylesheet({
            size: enabled.size ? size : undefined,
            radius: enabled.radius ? { corners, unit: radiusUnit } : undefined,
            layers: enabled.shadow ? layers : undefined,
            foreground: enabled.foreground ? foreground : undefined,
            backdrop,
          }),
    [
      outputTab,
      size,
      corners,
      radiusUnit,
      layers,
      foreground,
      backdrop,
      enabled,
    ],
  );

  const shadowColorOptions = [
    ...new Set(["#000000", ...paletteColors.map((hex) => hex.toLowerCase())]),
  ];

  function updateCorner(key: keyof RadiusCorners, next: number) {
    setCorners((current) =>
      linked
        ? { topLeft: next, topRight: next, bottomRight: next, bottomLeft: next }
        : { ...current, [key]: next },
    );
  }

  function changeRadiusUnit(nextUnit: RadiusUnit) {
    // Clamps on the way over, because the two units have different ceilings — a 100px corner
    // carried straight into percent mode would be past the 50% limit and stick at the end of
    // every slider until you noticed.
    const nextMax = nextUnit === "px" ? MAX_RADIUS_PX : MAX_RADIUS_PERCENT;
    setCorners((current) => ({
      topLeft: Math.min(current.topLeft, nextMax),
      topRight: Math.min(current.topRight, nextMax),
      bottomRight: Math.min(current.bottomRight, nextMax),
      bottomLeft: Math.min(current.bottomLeft, nextMax),
    }));
    setRadiusUnit(nextUnit);
  }

  /** What the pointer is over: a corner rounds, an edge resizes, the middle moves the shadow.
   *  Splitting by region is what lets all three gestures live on one shape with nothing drawn on
   *  top of it — the only affordance is the cursor, which changes as you move across. */
  function zoneAt(clientX: number, clientY: number): Zone {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const zone = Math.min(MAX_EDGE_ZONE, rect.width / 3, rect.height / 3);

    const nearLeft = x <= zone;
    const nearRight = x >= rect.width - zone;
    const nearTop = y <= zone;
    const nearBottom = y >= rect.height - zone;

    // Corners win over edges: where the two overlap, you're at a corner.
    if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
      const corner = nearBottom
        ? nearRight
          ? "bottomRight"
          : "bottomLeft"
        : nearRight
          ? "topRight"
          : "topLeft";
      return { kind: "radius", corner };
    }
    if (nearLeft) return { kind: "resize", axis: "x", sign: -1 };
    if (nearRight) return { kind: "resize", axis: "x", sign: 1 };
    if (nearTop) return { kind: "resize", axis: "y", sign: -1 };
    if (nearBottom) return { kind: "resize", axis: "y", sign: 1 };
    return { kind: "shadow" };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) {
      setCursor(cursorFor(zoneAt(e.clientX, e.clientY)));
      return;
    }
    const dx = e.clientX - drag.pointerX;
    const dy = e.clientY - drag.pointerY;
    // Pulled out as a local so the narrowing below survives into the state callbacks —
    // `drag.zone` is a mutable property, which discards it at the closure boundary.
    const { zone } = drag;

    if (zone.kind === "radius") {
      // Projected toward the middle of the box, so "pull inward to round it" holds for every
      // corner. Without the per-corner signs the right-hand corners would round as you dragged
      // away from them, which reads as broken immediately.
      const signX = LEFT_CORNERS.includes(zone.corner) ? 1 : -1;
      const signY = TOP_CORNERS.includes(zone.corner) ? 1 : -1;
      const delta = (dx * signX + dy * signY) / 2;
      updateCorner(
        zone.corner,
        clamp(Math.round(drag.startRadius + delta), 0, maxRadius),
      );
      return;
    }

    if (zone.kind === "shadow") {
      setLayers((current) =>
        current.map((layer, i) =>
          i === selectedLayer
            ? {
                ...layer,
                offsetX: clamp(
                  Math.round(drag.startOffsetX + dx),
                  -MAX_SHADOW_OFFSET,
                  MAX_SHADOW_OFFSET,
                ),
                offsetY: clamp(
                  Math.round(drag.startOffsetY + dy),
                  -MAX_SHADOW_OFFSET,
                  MAX_SHADOW_OFFSET,
                ),
              }
            : layer,
        ),
      );
      return;
    }

    // Doubled because the box is centred: moving one edge out by a pixel widens it by two, so
    // matching the delta directly would leave the edge trailing the pointer at half speed.
    if (zone.axis === "x") {
      setSize((current) => ({
        ...current,
        width: clamp(
          Math.round(drag.startWidth + dx * zone.sign * 2),
          MIN_WIDTH,
          MAX_WIDTH,
        ),
      }));
    } else {
      setSize((current) => ({
        ...current,
        height: clamp(
          Math.round(drag.startHeight + dy * zone.sign * 2),
          MIN_HEIGHT,
          MAX_HEIGHT,
        ),
      }));
    }
  }

  const selected = layers[selectedLayer] ?? layers[0];
  const shadowSummary =
    layers.length === 0
      ? "none"
      : layers.length === 1
        ? `${layers[0]?.blur}px blur`
        : `${layers.length} layers`;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div
        className="flex min-h-72 items-center justify-center rounded-lg border border-black/10 p-6 dark:border-white/10"
        style={{ background: formatFill(backdrop) }}
      >
        <div
          ref={boxRef}
          onPointerDown={(e) => {
            const zone = zoneAt(e.clientX, e.clientY);
            if (!zone) return;
            dragRef.current = {
              zone,
              startRadius: zone.kind === "radius" ? corners[zone.corner] : 0,
              startWidth: size.width,
              startHeight: size.height,
              startOffsetX: selected?.offsetX ?? 0,
              startOffsetY: selected?.offsetY ?? 0,
              pointerX: e.clientX,
              pointerY: e.clientY,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => {
            dragRef.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerLeave={() => {
            if (!dragRef.current) setCursor("default");
          }}
          className="touch-none select-none"
          style={{
            width: size.width,
            height: size.height,
            background: formatFill(foreground),
            borderRadius: enabled.radius ? radiusValue : undefined,
            boxShadow: shadowValue,
            cursor,
          }}
        />
      </div>
      <p className="-mt-2 text-[11px] text-zinc-500">
        Corners round · edges resize · middle moves the shadow
      </p>

      <SurfaceControls
        backdrop={backdrop}
        foreground={foreground}
        paletteColors={[...paletteColors, ...libraryColors]}
        onBackdropChange={setBackdrop}
        onForegroundChange={setForeground}
        foregroundEnabled={enabled.foreground}
        onForegroundEnabledChange={(next) =>
          setEnabled((c) => ({ ...c, foreground: next }))
        }
      />

      <CollapsibleSection
        title="Size"
        summary={`${size.width} × ${size.height}`}
        enabled={enabled.size}
        onToggle={(next) => setEnabled((c) => ({ ...c, size: next }))}
      >
        <Slider
          label="Width"
          value={size.width}
          min={MIN_WIDTH}
          max={MAX_WIDTH}
          step={1}
          displayValue={`${size.width}px`}
          onChange={(width) => setSize((c) => ({ ...c, width }))}
        />
        <Slider
          label="Height"
          value={size.height}
          min={MIN_HEIGHT}
          max={MAX_HEIGHT}
          step={1}
          displayValue={`${size.height}px`}
          onChange={(height) => setSize((c) => ({ ...c, height }))}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Radius"
        summary={radiusValue}
        enabled={enabled.radius}
        onToggle={(next) => setEnabled((c) => ({ ...c, radius: next }))}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5 dark:bg-surface-elevated">
            {(["px", "%"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => changeRadiusUnit(id)}
                className={`cursor-pointer rounded px-2.5 py-0.5 text-[11px] font-medium transition active:scale-95 ${
                  radiusUnit === id
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {id}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={linked}
              onChange={(e) => setLinked(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
            />
            <span className="text-xs text-zinc-700 dark:text-zinc-300">
              Link corners
            </span>
          </label>
        </div>

        {/* Linked mode shows one slider rather than four that move in lockstep — four identical
            sliders sliding together is noise, and it isn't obvious they're linked rather than
            broken. */}
        {linked ? (
          <Slider
            label="All corners"
            value={corners.topLeft}
            min={0}
            max={maxRadius}
            step={1}
            displayValue={`${corners.topLeft}${radiusUnit}`}
            onChange={(next) => updateCorner("topLeft", next)}
          />
        ) : (
          RADIUS_CORNER_KEYS.map((key) => (
            <Slider
              key={key}
              label={RADIUS_CORNER_LABELS[key]}
              value={corners[key]}
              min={0}
              max={maxRadius}
              step={1}
              displayValue={`${corners[key]}${radiusUnit}`}
              onChange={(next) => updateCorner(key, next)}
            />
          ))
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Shadow"
        summary={shadowSummary}
        enabled={enabled.shadow}
        onToggle={(next) => setEnabled((c) => ({ ...c, shadow: next }))}
      >
        <ShadowLayerControls
          layers={layers}
          selectedIndex={selectedLayer}
          presetValue={presetValue}
          colorOptions={shadowColorOptions}
          onSelectLayer={setSelectedLayer}
          onChangeLayers={setLayers}
          onChangePreset={setPresetValue}
        />
      </CollapsibleSection>

      <CssOutput
        code={output}
        tabs={OUTPUT_TABS}
        activeTab={outputTab}
        onTabChange={setOutputTab}
      />
    </div>
  );
}
