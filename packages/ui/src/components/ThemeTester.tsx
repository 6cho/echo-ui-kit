import {
  contrastRatio,
  DEFAULT_NEUTRAL_TINT,
  deriveNeutrals,
  formatThemeCss,
  paletteAccent,
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
import { Slider } from "./Slider";
import { ToolColumns } from "./ToolColumns";

type Mode = "light" | "dark";

// One role row: two lines of text plus its padding and border, and the gap between rows. Used to
// cut the list off on a row boundary rather than through one.
const ROLE_ROW_HEIGHT = 46;
const ROLE_ROW_GAP = 4;

type PreviewElement =
  | "page"
  | "card"
  | "heading"
  | "copy"
  | "primaryButton"
  | "secondaryButton";

type Property = "Background" | "Border" | "Text";

/**
 * What paints each part of the preview.
 *
 * Many-to-many in both directions, which is the whole reason this exists: a button has a fill and
 * a label, a card has a fill and an edge, and the edge is the same role the secondary button's
 * outline uses. Mapping one element to one role — which is what clicking used to do — could only
 * ever reach one of the colours you were looking at, and needed invented click targets for the
 * rest.
 */
const ELEMENTS: Record<
  PreviewElement,
  { label: string; parts: { property: Property; role: ThemeRoleId }[] }
> = {
  page: {
    label: "Page",
    parts: [{ property: "Background", role: "background" }],
  },
  card: {
    label: "Card",
    parts: [
      { property: "Background", role: "surface" },
      { property: "Border", role: "border" },
    ],
  },
  heading: {
    label: "Heading",
    parts: [{ property: "Text", role: "text" }],
  },
  copy: {
    label: "Secondary copy",
    parts: [{ property: "Text", role: "muted" }],
  },
  primaryButton: {
    label: "Primary button",
    parts: [
      { property: "Background", role: "primary" },
      { property: "Text", role: "onPrimary" },
    ],
  },
  secondaryButton: {
    label: "Secondary button",
    parts: [
      { property: "Border", role: "border" },
      { property: "Text", role: "text" },
    ],
  },
};

/** Every element a role paints, so editing it can say what else will change. */
function elementsUsing(role: ThemeRoleId): PreviewElement[] {
  return (Object.keys(ELEMENTS) as PreviewElement[]).filter((element) =>
    ELEMENTS[element].parts.some((part) => part.role === role),
  );
}

/**
 * A miniature interface painted entirely from a mapping, and the quickest way to edit one.
 *
 * Every part of it selects itself as the thing being edited, in the mode it was clicked in —
 * wanting to change something you are looking at in dark mode is rarely a wish to change it in
 * light. What happens next is the element panel's job: it lists every colour that element uses.
 *
 * The containers' hit areas are siblings of their contents rather than wrappers around them —
 * stretched behind, with the contents sitting above. A button inside a button is not valid HTML
 * and the inner one stops being reachable, so the card can't simply wrap the heading it holds.
 *
 * Abstract on purpose: enough shape to judge the colours against each other, not a mockup of any
 * particular screen.
 */
function Preview({
  mapping,
  label,
  mode,
  activeElement,
  activeMode,
  onSelect,
}: {
  mapping: ThemeMapping;
  label: string;
  mode: Mode;
  activeElement: PreviewElement;
  activeMode: Mode;
  onSelect: (element: PreviewElement, mode: Mode) => void;
}) {
  /** A ring on whatever is being edited, in the view it is being edited in. */
  const ring = (element: PreviewElement) =>
    activeMode === mode && activeElement === element
      ? "ring-2 ring-brand-500 ring-offset-1"
      : "";
  const title = (element: PreviewElement) =>
    `Customise the ${ELEMENTS[element].label.toLowerCase()} in ${mode} mode`;

  const Area = ({ element }: { element: PreviewElement }) => (
    <button
      type="button"
      onClick={() => onSelect(element, mode)}
      title={title(element)}
      aria-label={title(element)}
      className={`absolute inset-0 cursor-pointer rounded-md ${ring(element)}`}
    />
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div
        className="relative flex flex-col gap-2 rounded-lg border border-black/10 p-3 dark:border-white/10"
        style={{ backgroundColor: mapping.background }}
      >
        <Area element="page" />
        <div
          className="relative flex flex-col gap-2 rounded-md border p-2.5"
          style={{
            backgroundColor: mapping.surface,
            borderColor: mapping.border,
          }}
        >
          <Area element="card" />
          <button
            type="button"
            onClick={() => onSelect("heading", mode)}
            title={title("heading")}
            className={`relative cursor-pointer rounded text-left text-xs font-semibold ${ring("heading")}`}
            style={{ color: mapping.text }}
          >
            Card heading
          </button>
          <button
            type="button"
            onClick={() => onSelect("copy", mode)}
            title={title("copy")}
            className={`relative cursor-pointer rounded text-left text-[11px] ${ring("copy")}`}
            style={{ color: mapping.muted }}
          >
            Secondary copy that sits underneath it.
          </button>
          <div className="relative flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => onSelect("primaryButton", mode)}
              title={title("primaryButton")}
              className={`cursor-pointer rounded px-2 py-1 text-[11px] font-medium ${ring("primaryButton")}`}
              style={{
                backgroundColor: mapping.primary,
                color: mapping.onPrimary,
              }}
            >
              Primary
            </button>
            <button
              type="button"
              onClick={() => onSelect("secondaryButton", mode)}
              title={title("secondaryButton")}
              className={`cursor-pointer rounded border px-2 py-1 text-[11px] font-medium ${ring("secondaryButton")}`}
              style={{ borderColor: mapping.border, color: mapping.text }}
            >
              Secondary
            </button>
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
export function ThemeTester({
  paletteColors,
  baseColor,
}: {
  paletteColors: string[];
  baseColor?: string | null;
}) {
  /**
   * Near-greys carrying the palette's hue, derived rather than picked.
   *
   * Deliberately not part of the palette: an interface is mostly structure — page, card, divider,
   * body copy — and a palette asked to supply those as well as its accents ends up either too
   * long to be a palette or too colourful to be an interface. These exist alongside it so a theme
   * can be built out of both without either one muddying the other.
   */
  const [tint, setTint] = useState(DEFAULT_NEUTRAL_TINT);
  /**
   * Which colour the neutrals lean toward: the palette's accent, which is also what the theme
   * paints its buttons with. So they follow the selection — pick different colours in the palette
   * and the structure re-tints with them — and they lean toward the same colour the theme is
   * accented in rather than toward something worked out separately.
   */
  const neutralSource = paletteAccent(paletteColors) ?? baseColor ?? "#71717a";
  const neutrals = useMemo(
    () => deriveNeutrals(neutralSource, tint),
    [neutralSource, tint],
  );
  // The two ends of what the slider can do, so its track shows them rather than naming them.
  const tintTrack = useMemo(() => {
    const at = (amount: number) =>
      deriveNeutrals(neutralSource, amount).find((entry) => entry.step === 500)
        ?.hex ?? "#71717a";
    return {
      gradient: `linear-gradient(90deg, ${at(0)}, ${at(1)})`,
      thumb: at(tint),
    };
  }, [neutralSource, tint]);
  const neutralHexes = useMemo(
    () => neutrals.map((entry) => entry.hex),
    [neutrals],
  );

  const [pair, setPair] = useState<ThemePair>(() =>
    suggestThemePair(paletteColors, neutralHexes),
  );
  const [mode, setMode] = useState<Mode>("light");
  const [element, setElement] = useState<PreviewElement>("primaryButton");
  const [role, setRole] = useState<ThemeRoleId>("primary");

  // Re-proposed whenever the palette itself changes, because a mapping onto colors that are no
  // longer in the palette isn't a theme anyone wants to keep editing.
  const paletteKey = paletteColors.join(",");
  const neutralKey = neutralHexes.join(",");
  useEffect(() => {
    setPair(
      suggestThemePair(
        paletteKey ? paletteKey.split(",") : [],
        neutralKey ? neutralKey.split(",") : [],
      ),
    );
  }, [paletteKey, neutralKey]);

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

  /**
   * Picking something in a preview makes it the thing being edited, in the mode it was picked in.
   * The property being edited stays put if the new element has it too — moving from the card to
   * the secondary button while working on borders shouldn't knock you back to backgrounds.
   */
  function selectElement(next: PreviewElement, nextMode: Mode) {
    setElement(next);
    setMode(nextMode);
    const parts = ELEMENTS[next].parts;
    if (!parts.some((part) => part.role === role)) {
      setRole((parts[0] as { role: ThemeRoleId }).role);
    }
  }

  /** Picking from the full list moves the selected element to one the role actually paints. */
  function selectRole(next: ThemeRoleId) {
    setRole(next);
    if (!ELEMENTS[element].parts.some((part) => part.role === next)) {
      const owner = elementsUsing(next)[0];
      if (owner) setElement(owner);
    }
  }

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
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-zinc-500">
          Click any part of a preview to customise the colours it uses.
        </p>
        <div className="flex gap-3">
          <Preview
            mapping={pair.light}
            label="Light"
            mode="light"
            activeElement={element}
            activeMode={mode}
            onSelect={selectElement}
          />
          <Preview
            mapping={pair.dark}
            label="Dark"
            mode="dark"
            activeElement={element}
            activeMode={mode}
            onSelect={selectElement}
          />
        </div>
      </div>

      {/* Everything that paints the selected element, each one editable. An element is rarely one
          colour, so this is a list rather than a single swatch — and a role is rarely one
          element, so each row says what else it will change. Editing the secondary button's
          border recolours the card's edge too, and finding that out afterwards is worse than
          being told. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {`${mode} mode / ${ELEMENTS[element].label}`}
        </span>
        <div className="flex flex-col gap-1">
          {ELEMENTS[element].parts.map((part) => {
            const hex = pair[mode][part.role];
            const isActive = part.role === role;
            const roleLabel = THEME_ROLES.find(
              (r) => r.id === part.role,
            )?.label;
            const alsoOn = elementsUsing(part.role)
              .filter((other) => other !== element)
              .map((other) => ELEMENTS[other].label.toLowerCase());
            return (
              <button
                key={`${part.property}-${part.role}`}
                type="button"
                onClick={() => setRole(part.role)}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left transition ${
                  isActive
                    ? "border-brand-500"
                    : "border-black/10 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-surface-elevated"
                }`}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-md border border-black/10 dark:border-white/10"
                  style={{ backgroundColor: hex }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {part.property}
                  </span>
                  <span className="truncate text-[11px] text-zinc-500">
                    {alsoOn.length > 0
                      ? `${roleLabel} · also on the ${alsoOn.join(", ")}`
                      : roleLabel}
                  </span>
                </span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">
                  {hex}
                </span>
              </button>
            );
          })}
        </div>
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

      {/* Six rows and then it scrolls. The list is a way to reach a role, not the thing being
          looked at — the previews above are — and at full height it pushed them off the top of a
          panel. Sized from the rows rather than guessed so it lands on a boundary instead of
          halfway through the seventh. */}
      <div
        className="flex flex-col gap-1 overflow-y-auto"
        style={{ maxHeight: ROLE_ROW_HEIGHT * 6 + ROLE_ROW_GAP * 5 }}
      >
        {THEME_ROLES.map((definition) => {
          const hex = pair[mode][definition.id];
          const isActive = definition.id === role;
          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => selectRole(definition.id)}
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

      {/* Under the palette, because that is the order they are derived in and the order they
          matter in: the palette is the decision, these follow from it. */}
      <div className="flex flex-col gap-1.5">
        <ColorStrip
          label="Neutrals · page, cards, borders and copy"
          colors={neutralHexes}
          value={pair[mode][role]}
          onChange={assign}
        />
        {/* How much of the palette's colour the structure carries, from grey to the colour's own
            saturation. No value along it is more correct than another, which is why it is a
            control rather than a constant — but the theme did start somewhere, so the slider
            carries a tick for it. */}
        <Slider
          label="Neutral tint"
          value={tint}
          min={0}
          max={1}
          step={0.01}
          markerValue={DEFAULT_NEUTRAL_TINT}
          trackBackground={tintTrack.gradient}
          thumbColor={tintTrack.thumb}
          displayValue={
            tint === 0
              ? "Grayscale"
              : tint === 1
                ? "Full saturation"
                : `${Math.round(tint * 100)}%`
          }
          onChange={setTint}
        />
      </div>

      <button
        type="button"
        onClick={() => setPair(suggestThemePair(paletteColors, neutralHexes))}
        className="cursor-pointer self-start rounded-full border border-zinc-300 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-surface-hover"
      >
        Re-suggest from palette
      </button>

      <CssOutput code={css} />
    </ToolColumns>
  );
}
