import { toOklch } from "@echo-ui-kit/tools-core";
import { useMemo } from "react";

// Wheel shrunk so more of the total marker footprint goes to the pointer stems instead of the
// ring itself — a thinner ring with longer, clearly separated pointers reads far less clunky
// than a big ring with markers crowded right against its edge.
const SIZE = 112;
const RADIUS = SIZE / 2;
// Each marker is a short tick radiating outward from the rim, with the color swatch at its tip
// — nothing overlaps the ring itself anymore, so the gradient stays visually uninterrupted.
const TICK_LENGTH = 18;
const TIP_RADIUS = RADIUS + TICK_LENGTH;
const TICK_MID_RADIUS = RADIUS + TICK_LENGTH / 2;
// How far a marker can poke past the wheel's own box (tick + roughly half the marker circle) —
// reserved as margin on every side so this stays clear of neighbors regardless of whether a
// consumer lays it out in a row or a column. Exported so a consumer aligning something against
// the *visible ring* (not this component's full margin-inclusive box) can inset by the same
// amount — otherwise "top-align with the wheel" ends up aligning with the pointer space above
// the ring instead of the ring itself.
export const COLOR_WHEEL_VISUAL_INSET = TICK_LENGTH + 7;
const MARKER_OVERHANG = COLOR_WHEEL_VISUAL_INSET;

// The conic gradient sweeps hue around the circle — 6 stops, 60° apart, angle === hue (before
// any rotation offset) so marker placement below can reuse that angle directly. No radial
// white-to-transparent fade anymore: that was there to suggest "less saturated toward the
// center," which stopped meaning anything once markers stopped being plotted by radius — a
// uniform ring is the honest version now. `from` takes the same rotation offset markers use, so
// the ring's own color at 3 o'clock always matches the base color sitting there.
//
// Chroma is the base color's *actual* OKLCH chroma, not a fixed decorative value — a gray base
// (chroma ~0) renders an essentially gray ring, since a near-zero-chroma color looks the same
// at every hue; a vivid, highly saturated base renders a correspondingly vivid ring. Capped only
// to guard against a wildly out-of-range value, not to flatten genuinely saturated colors.
const OKLCH_RING_L = 0.65;
const MAX_RING_CHROMA = 0.37;
function wheelBackground(fromDeg: number, chroma: number): string {
  return `conic-gradient(from ${fromDeg}deg, oklch(${OKLCH_RING_L} ${chroma} 0), oklch(${OKLCH_RING_L} ${chroma} 60), oklch(${OKLCH_RING_L} ${chroma} 120), oklch(${OKLCH_RING_L} ${chroma} 180), oklch(${OKLCH_RING_L} ${chroma} 240), oklch(${OKLCH_RING_L} ${chroma} 300), oklch(${OKLCH_RING_L} ${chroma} 360))`;
}

// Punches the disc into a ring: nothing is plotted by distance from center, so a filled disc
// implied a color could meaningfully sit in the middle. The gradient's size is pinned to an
// explicit `${RADIUS}px` circle rather than left to default — radial-gradient's default sizing
// is "farthest-corner", which for a square box is the diagonal, not the visible disc's radius,
// so plain percentage stops would carve a hole far bigger than intended.
//
// The ring's own thickness gets the same treatment the whole disc used to have (fading in from
// the center) — instead of a flat-opacity band with a hard inner edge, it glows in gradually
// from faint near the hole to fully solid right at the rim, across the same 10px band.
const RING_THICKNESS = 10;
const RING_INNER = RADIUS - RING_THICKNESS;
const RING_MASK = `radial-gradient(circle ${RADIUS}px at center, transparent 0px, transparent ${RING_INNER}px, rgba(0,0,0,0.2) ${RING_INNER + RING_THICKNESS * 0.3}px, rgba(0,0,0,0.6) ${RING_INNER + RING_THICKNESS * 0.7}px, black ${RADIUS}px)`;

interface WheelMarker {
  hex: string;
  tickX: number;
  tickY: number;
  tickRotateDeg: number;
  tipX: number;
  tipY: number;
}

function hueOf(hex: string): number {
  return toOklch(hex).h ?? 0;
}

// Image-derived colors aren't related by any hue formula the way a harmony's are, so plotting
// them at their real OKLCH angles wouldn't illustrate a relationship — it'd just be wherever
// k-means happened to land, indistinguishable from noise. Spacing them evenly instead, and
// blending the ring directly between the actual palette colors rather than sweeping the full
// hue spectrum, turns the wheel into an honest "here are your N colors, equally represented"
// diagram instead of a geometry claim the data doesn't support. The first color (already the
// most prominent, by how the caller orders `colors`) anchors at 3 o'clock, same convention as
// harmony mode's baseColor anchor, so the two modes still feel like the same component.
function gradientWheelBackground(colors: string[]): string {
  if (colors.length === 0) return "transparent";
  if (colors.length === 1) return colors[0] as string;
  const n = colors.length;
  const stops = colors.map((hex, i) => `${hex} ${(i / n) * 100}%`);
  stops.push(`${colors[0]} 100%`);
  return `conic-gradient(from 90deg, ${stops.join(", ")})`;
}

/**
 * Plots each color as a tick radiating outward from a gradient ring, with the color swatch at
 * its tip — every marker sits at the same fixed distance from center, positioned only by angle.
 *
 * Two modes: "harmony" (default) places each color at its real OKLCH hue angle on a
 * full-hue-spectrum ring, so what's visible is purely the relationship a harmony formula
 * describes (triadic 120° apart, complementary directly opposite) — the whole diagram rotates so
 * baseColor always lands at 3 o'clock, with every other marker and the ring itself shifting by
 * that same amount so the *relative* angles (the actual harmony relationship) stay intact.
 * "gradient" instead spaces markers evenly and blends the ring between the actual palette colors
 * — for a palette with no formula behind it (image-derived), there's no real hue relationship to
 * illustrate, so this shows the colors themselves rather than a claim about their geometry.
 */
export function ColorWheel({
  colors,
  baseColor,
  onToggleColor,
  mode = "harmony",
}: {
  colors: string[];
  baseColor: string;
  onToggleColor?: (hex: string) => void;
  mode?: "harmony" | "gradient";
}) {
  const rotationOffset = useMemo(() => {
    try {
      const baseHue = hueOf(baseColor);
      return (((90 - baseHue) % 360) + 360) % 360;
    } catch {
      return 0;
    }
  }, [baseColor]);

  const ringChroma = useMemo(() => {
    try {
      return Math.max(0, Math.min(toOklch(baseColor).c, MAX_RING_CHROMA));
    } catch {
      return 0;
    }
  }, [baseColor]);

  const markers = useMemo<WheelMarker[]>(() => {
    const n = colors.length;
    return colors.map((hex, i) => {
      let angle: number;
      if (mode === "gradient") {
        angle = n > 0 ? (90 + i * (360 / n)) % 360 : 90;
      } else {
        let hue = 0;
        try {
          hue = hueOf(hex);
        } catch {
          // Falls back to hue=0 — the marker lands wherever rotationOffset puts hue 0, still visible.
        }
        angle = (hue + rotationOffset) % 360;
      }
      const angleRad = (angle * Math.PI) / 180;
      const sin = Math.sin(angleRad);
      const cos = Math.cos(angleRad);
      return {
        hex,
        tickX: RADIUS + TICK_MID_RADIUS * sin,
        tickY: RADIUS - TICK_MID_RADIUS * cos,
        // A horizontal bar's natural direction is 90° (3 o'clock) in this "clockwise from top"
        // hue convention, so it needs that much less rotation to point at the target angle.
        tickRotateDeg: angle - 90,
        tipX: RADIUS + TIP_RADIUS * sin,
        tipY: RADIUS - TIP_RADIUS * cos,
      };
    });
  }, [colors, rotationOffset, mode]);

  const background =
    mode === "gradient"
      ? gradientWheelBackground(colors)
      : wheelBackground(rotationOffset, ringChroma);

  return (
    // Markers are siblings of the masked gradient layer, not children — a mask-image's painting
    // area is sized to its own element's box, so a tick/circle positioned beyond that box's
    // edges (as these are, by design) would otherwise get clipped away too. Margin (not padding)
    // reserves MARKER_OVERHANG of clearance on every side so this stays self-contained regardless
    // of whether a consumer lays it out in a row or a column.
    <div
      className="relative h-28 w-28 shrink-0"
      style={{ margin: MARKER_OVERHANG }}
    >
      <div
        className="absolute inset-0 rounded-full shadow-inner"
        style={{
          background,
          WebkitMaskImage: RING_MASK,
          maskImage: RING_MASK,
        }}
      />

      {markers.flatMap(
        ({ hex, tickX, tickY, tickRotateDeg, tipX, tipY }, i) => [
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: colors can repeat the same hue at different lightness, so hex alone isn't a stable unique key here
            key={`tick-${hex}-${i}`}
            className="absolute h-0.5 rounded-full"
            style={{
              left: tickX,
              top: tickY,
              width: TICK_LENGTH,
              // Fades in the same direction as the ring's own glow — transparent at the ring end,
              // solid white at the tip — so the pointer reads as emerging from the ring rather
              // than a flat bar stuck onto it. "to right" is the tick's un-rotated local space,
              // where right === outward-toward-the-tip (see tickRotateDeg above).
              background: "linear-gradient(to right, transparent, white)",
              transform: `translate(-50%, -50%) rotate(${tickRotateDeg}deg)`,
            }}
          />,
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: colors can repeat the same hue at different lightness, so hex alone isn't a stable unique key here
            key={`marker-${hex}-${i}`}
            type="button"
            title={hex}
            onClick={onToggleColor ? () => onToggleColor(hex) : undefined}
            className="-translate-x-1/2 -translate-y-1/2 absolute h-3.5 w-3.5 cursor-pointer rounded-full border border-white/60 shadow-sm transition active:scale-90"
            style={{ left: tipX, top: tipY, backgroundColor: hex }}
          />,
        ],
      )}
    </div>
  );
}
