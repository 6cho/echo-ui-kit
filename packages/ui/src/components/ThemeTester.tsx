import {
  type ComponentColors,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ColorEditorModal } from "./ColorEditorModal";
import { CssOutput } from "./CssOutput";
import { ToolColumns } from "./ToolColumns";

type Mode = "light" | "dark";

type PreviewElement =
  | "page"
  | "toolbar"
  | "activeIcon"
  | "card"
  | "primaryButton"
  | "secondaryButton"
  | "input"
  | "control";

// Icons in the toolbar preview, small enough that four controls and two buttons fit one row of a
// preview half a panel wide.
const ICON = "h-3 w-3";

type Property = "Background" | "Border" | "Primary text" | "Secondary text";

const PROPERTIES: Property[] = [
  "Background",
  "Border",
  "Primary text",
  "Secondary text",
];

/**
 * A colour belonging to one element rather than to a shared role — the secondary button's own
 * fill, say. Named by element and property, so it is obvious from the key what it paints.
 */
type ComponentKey = `${PreviewElement}.${Property}`;

/** What is being edited: a shared role, or one element's own colour. */
type Target = ThemeRoleId | ComponentKey;

function componentKey(element: PreviewElement, property: Property) {
  return `${element}.${property}` as ComponentKey;
}

function isComponentKey(target: Target): target is ComponentKey {
  return target.includes(".");
}

/**
 * What paints each part of the preview, in one vocabulary for all of them.
 *
 * Every element is described by the same four properties — background, border, primary text,
 * secondary text. `parts` are the ones the shared theme already provides, through its roles.
 * `optional` are the ones the element can be given if wanted: properties with somewhere to show
 * in the preview but no role to come from, so switching one on creates a colour of that element's
 * own. Anything in neither has nowhere to show — a button has no secondary text to colour — and
 * says so rather than offering a switch that would change nothing.
 *
 * The heading and the secondary copy are the card's text, not elements of their own. Clicking one
 * selects the card with that property active, which is the honest description: you are editing
 * what colour the card's primary text is, and that is a property of the card.
 */
const ELEMENTS: Record<
  PreviewElement,
  {
    label: string;
    parts: { property: Property; role: ThemeRoleId }[];
    optional: Property[];
  }
> = {
  page: {
    label: "Page",
    parts: [{ property: "Background", role: "background" }],
    optional: ["Border"],
  },
  toolbar: {
    label: "Toolbar",
    parts: [
      { property: "Background", role: "surface" },
      { property: "Border", role: "border" },
      // Its icons: the ones in reach in body colour, the ones further from hand in muted.
      { property: "Primary text", role: "text" },
      { property: "Secondary text", role: "muted" },
    ],
    optional: [],
  },
  activeIcon: {
    label: "Active icon",
    parts: [
      { property: "Background", role: "primary" },
      { property: "Primary text", role: "onPrimary" },
    ],
    optional: [],
  },
  card: {
    label: "Card",
    parts: [
      { property: "Background", role: "surface" },
      { property: "Border", role: "border" },
      { property: "Primary text", role: "text" },
      { property: "Secondary text", role: "muted" },
    ],
    optional: [],
  },
  primaryButton: {
    label: "Primary button",
    parts: [
      { property: "Background", role: "primary" },
      { property: "Primary text", role: "onPrimary" },
    ],
    optional: ["Border"],
  },
  // In the palette's second colour, outlined rather than filled so it reads as secondary to the
  // primary button beside it — unless it is given a fill of its own.
  secondaryButton: {
    label: "Secondary button",
    parts: [
      { property: "Border", role: "secondary" },
      { property: "Primary text", role: "secondary" },
    ],
    optional: ["Background"],
  },
  // Fields sit in the page colour so they read as wells; their value is body copy and their
  // placeholder is muted copy.
  input: {
    label: "Input",
    parts: [
      { property: "Background", role: "background" },
      { property: "Border", role: "border" },
      { property: "Primary text", role: "text" },
      { property: "Secondary text", role: "muted" },
    ],
    optional: [],
  },
  control: {
    label: "Checkbox & switch",
    parts: [
      { property: "Background", role: "primary" },
      { property: "Border", role: "border" },
      { property: "Primary text", role: "onPrimary" },
    ],
    optional: [],
  },
};

/** Every element a role paints, so editing it can say what else will change. */
function elementsUsing(role: ThemeRoleId): PreviewElement[] {
  return (Object.keys(ELEMENTS) as PreviewElement[]).filter((element) =>
    ELEMENTS[element].parts.some((part) => part.role === role),
  );
}

/** Straight-line blend of two hex colours, `amount` of the way from `from` toward `to`. */
function mix(from: string, to: string, amount: number): string {
  const channels = (hex: string) =>
    [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((value, index) =>
      Math.round(value + ((b[index] ?? value) - value) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Where a newly switched-on colour starts — something that already belongs to the theme, so the
 * switch shows the property appearing rather than an arbitrary colour arriving with it.
 */
function startingColor(key: ComponentKey, mapping: ThemeMapping): string {
  switch (key) {
    // A soft fill of the button's own colour: the usual way a secondary button gets a background
    // without competing with the primary beside it.
    case "secondaryButton.Background": {
      // The strongest of these that still leaves the label readable on it. A fixed amount could
      // drag the label under AA — a dark yellow label on a fill tinted toward itself landed at
      // 3.72 — and a switch shouldn't produce a failure the moment it's flipped. The label already
      // clears AA on the bare surface, so backing off always finds one.
      for (const amount of [0.16, 0.12, 0.08, 0.04]) {
        const fill = mix(mapping.surface, mapping.secondary, amount);
        if (contrastRatio(mapping.secondary, fill) >= 4.5) return fill;
      }
      return mapping.surface;
    }
    // A deeper edge of the button's own fill, so it reads as definition rather than as a frame.
    case "primaryButton.Border":
      return mix(mapping.primary, mapping.text, 0.4);
    default:
      return mapping.border;
  }
}

/** A small on/off switch, sized to sit at the end of a property row. */
function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-7 shrink-0 cursor-pointer rounded-full transition ${
        checked ? "bg-brand-600" : "bg-zinc-300 dark:bg-zinc-600"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-300 ${checked ? "translate-x-3" : ""}`}
      />
    </button>
  );
}

/**
 * A miniature interface painted entirely from a mapping, and the quickest way to edit one.
 *
 * Every clickable part names an element and the thing it most directly shows — clicking the
 * heading means the card's primary text, not the card in general — in the mode it was clicked in,
 * since wanting to change something you are looking at in dark mode is rarely a wish to change it
 * in light.
 *
 * The ring follows what is being edited rather than the element, so it lands on the heading while
 * the card's primary text is being edited and on the card itself while its background is. That
 * keeps the panel and the picture pointing at the same thing. It only shows while the previews are
 * what was last clicked: a ring sitting on a button while you try colours for it covers the edge
 * you are trying to judge, so clicking anywhere else hides it and leaves the selection in place.
 *
 * The containers' hit areas are siblings of their contents rather than wrappers around them —
 * stretched behind, with the contents sitting above. A button inside a button is not valid HTML
 * and the inner one stops being reachable, so the card can't simply wrap the heading it holds.
 */
function Preview({
  mapping,
  components,
  label,
  mode,
  activeElement,
  activeTarget,
  activeMode,
  highlighted,
  onSelect,
}: {
  mapping: ThemeMapping;
  /** This mode's switched-on component colours. */
  components: Partial<Record<ComponentKey, string>>;
  label: string;
  mode: Mode;
  activeElement: PreviewElement;
  activeTarget: Target;
  activeMode: Mode;
  /** Whether to ring the active element at all. */
  highlighted: boolean;
  onSelect: (element: PreviewElement, target: Target, mode: Mode) => void;
}) {
  /** Ringed when this is the element being edited and one of the things it shows is. */
  const ring = (element: PreviewElement, shows: Target[]) =>
    highlighted &&
    activeMode === mode &&
    activeElement === element &&
    shows.includes(activeTarget)
      ? "ring-2 ring-brand-500 ring-offset-1"
      : "";
  const title = (element: PreviewElement, property: Property) =>
    `Customise the ${ELEMENTS[element].label.toLowerCase()}'s ${property.toLowerCase()} in ${mode} mode`;

  const pageBorder = components["page.Border"];
  const primaryBorder = components["primaryButton.Border"];
  const secondaryFill = components["secondaryButton.Background"];

  // The two buttons appear in the toolbar and on the card, and should be the same component in
  // both. Render functions rather than components declared in here: a component defined inside
  // another is a new type on every render, so React would tear it down and rebuild it each time.
  const buttonSize = (size: "sm" | "md") =>
    size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";
  // Always bordered, in its own fill when no border has been switched on, so switching one on
  // changes a colour rather than nudging the button's size by two pixels.
  const primaryButton = (size: "sm" | "md") => (
    <button
      type="button"
      onClick={() => onSelect("primaryButton", "primary", mode)}
      title={title("primaryButton", "Background")}
      className={`cursor-pointer rounded border font-medium ${buttonSize(size)} ${ring("primaryButton", ["primary", "onPrimary", "primaryButton.Border"])}`}
      style={{
        backgroundColor: mapping.primary,
        borderColor: primaryBorder ?? mapping.primary,
        color: mapping.onPrimary,
      }}
    >
      {size === "sm" ? "New" : "Primary"}
    </button>
  );
  const secondaryButton = (size: "sm" | "md") => (
    <button
      type="button"
      onClick={() => onSelect("secondaryButton", "secondary", mode)}
      title={title("secondaryButton", "Border")}
      className={`cursor-pointer rounded border font-medium ${buttonSize(size)} ${ring("secondaryButton", ["secondary", "secondaryButton.Background"])}`}
      style={{
        borderColor: mapping.secondary,
        color: mapping.secondary,
        ...(secondaryFill ? { backgroundColor: secondaryFill } : {}),
      }}
    >
      {size === "sm" ? "Share" : "Secondary"}
    </button>
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div
        className={`relative flex flex-col gap-2 rounded-lg border p-2.5 ${
          pageBorder ? "" : "border-black/10 dark:border-white/10"
        }`}
        style={{
          backgroundColor: mapping.background,
          ...(pageBorder ? { borderColor: pageBorder } : {}),
        }}
      >
        <button
          type="button"
          onClick={() => onSelect("page", "background", mode)}
          title={title("page", "Background")}
          aria-label={title("page", "Background")}
          className={`absolute inset-0 cursor-pointer rounded-lg ${ring("page", ["background", "page.Border"])}`}
        />

        {/* A toolbar: icons in body and muted copy colours, the current one filled with the
            accent, and the two buttons at the end. Icon buttons are where a theme's accent is
            most often wrong — a filled square at 22px shows a muddy accent far sooner than a
            button with a word in it. */}
        <div
          className="relative flex items-center gap-1 rounded-md border px-1.5 py-1"
          style={{
            backgroundColor: mapping.surface,
            borderColor: mapping.border,
          }}
        >
          <button
            type="button"
            onClick={() => onSelect("toolbar", "surface", mode)}
            title={title("toolbar", "Background")}
            aria-label={title("toolbar", "Background")}
            className={`absolute inset-0 cursor-pointer rounded-md ${ring("toolbar", ["surface", "border"])}`}
          />
          <button
            type="button"
            onClick={() => onSelect("activeIcon", "primary", mode)}
            title={title("activeIcon", "Background")}
            aria-label={title("activeIcon", "Background")}
            className={`relative cursor-pointer rounded p-1 ${ring("activeIcon", ["primary", "onPrimary"])}`}
            style={{
              backgroundColor: mapping.primary,
              color: mapping.onPrimary,
            }}
          >
            <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
              <path
                d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
                fill="currentColor"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onSelect("toolbar", "text", mode)}
            title={title("toolbar", "Primary text")}
            aria-label={title("toolbar", "Primary text")}
            className={`relative cursor-pointer rounded p-1 ${ring("toolbar", ["text"])}`}
            style={{ color: mapping.text }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className={ICON}
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6" />
              <path d="m20 20-4.5-4.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onSelect("toolbar", "muted", mode)}
            title={title("toolbar", "Secondary text")}
            aria-label={title("toolbar", "Secondary text")}
            className={`relative cursor-pointer rounded p-1 ${ring("toolbar", ["muted"])}`}
            style={{ color: mapping.muted }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={ICON}
              aria-hidden="true"
            >
              <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
              <path d="M10 21h4" />
            </svg>
          </button>
          <div className="relative ml-auto flex items-center gap-1">
            {secondaryButton("sm")}
            {primaryButton("sm")}
          </div>
        </div>

        <div
          className="relative flex flex-col gap-2 rounded-md border p-2.5"
          style={{
            backgroundColor: mapping.surface,
            borderColor: mapping.border,
          }}
        >
          <button
            type="button"
            onClick={() => onSelect("card", "surface", mode)}
            title={title("card", "Background")}
            aria-label={title("card", "Background")}
            className={`absolute inset-0 cursor-pointer rounded-md ${ring("card", ["surface", "border"])}`}
          />
          <button
            type="button"
            onClick={() => onSelect("card", "text", mode)}
            title={title("card", "Primary text")}
            className={`relative cursor-pointer rounded text-left text-xs font-semibold ${ring("card", ["text"])}`}
            style={{ color: mapping.text }}
          >
            Card heading
          </button>
          <button
            type="button"
            onClick={() => onSelect("card", "muted", mode)}
            title={title("card", "Secondary text")}
            className={`relative cursor-pointer rounded text-left text-[11px] ${ring("card", ["muted"])}`}
            style={{ color: mapping.muted }}
          >
            Secondary copy that sits underneath it.
          </button>
          <div className="relative flex items-center gap-1.5 pt-0.5">
            {primaryButton("md")}
            {secondaryButton("md")}
          </div>
        </div>

        {/* A form, on a card of its own. Fields sit in the page colour rather than the card's, so
            they read as wells to type into; a value is body copy and a placeholder is muted copy,
            which is exactly where a too-faint muted colour gets found out. */}
        <div
          className="relative flex flex-col gap-1.5 rounded-md border p-2.5"
          style={{
            backgroundColor: mapping.surface,
            borderColor: mapping.border,
          }}
        >
          <button
            type="button"
            onClick={() => onSelect("card", "surface", mode)}
            title={title("card", "Background")}
            aria-label={title("card", "Background")}
            className={`absolute inset-0 cursor-pointer rounded-md ${ring("card", ["surface", "border"])}`}
          />
          <button
            type="button"
            onClick={() => onSelect("card", "text", mode)}
            title={title("card", "Primary text")}
            className={`relative cursor-pointer self-start rounded text-left text-[10px] font-medium ${ring("card", ["text"])}`}
            style={{ color: mapping.text }}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => onSelect("input", "text", mode)}
            title={title("input", "Primary text")}
            className={`relative cursor-pointer truncate rounded border px-2 py-1 text-left text-[11px] ${ring("input", ["background", "border", "text"])}`}
            style={{
              backgroundColor: mapping.background,
              borderColor: mapping.border,
              color: mapping.text,
            }}
          >
            ada@example.com
          </button>
          <button
            type="button"
            onClick={() => onSelect("input", "muted", mode)}
            title={title("input", "Secondary text")}
            className={`relative cursor-pointer truncate rounded border px-2 py-1 text-left text-[11px] ${ring("input", ["muted"])}`}
            style={{
              backgroundColor: mapping.background,
              borderColor: mapping.border,
              color: mapping.muted,
            }}
          >
            Search…
          </button>
          <div className="relative flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onSelect("control", "primary", mode)}
              title={title("control", "Background")}
              aria-label={title("control", "Background")}
              className={`flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-sm ${ring("control", ["primary", "onPrimary"])}`}
              style={{
                backgroundColor: mapping.primary,
                color: mapping.onPrimary,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-2.5 w-2.5"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onSelect("control", "border", mode)}
              title={title("control", "Border")}
              aria-label={title("control", "Border")}
              className={`h-3.5 w-3.5 cursor-pointer rounded-sm border ${ring("control", ["border"])}`}
              style={{
                backgroundColor: mapping.background,
                borderColor: mapping.border,
              }}
            />
            <button
              type="button"
              onClick={() => onSelect("control", "primary", mode)}
              title={title("control", "Background")}
              aria-label={title("control", "Background")}
              className={`relative ml-auto h-3.5 w-6 cursor-pointer rounded-full ${ring("control", ["primary", "onPrimary"])}`}
              style={{ backgroundColor: mapping.primary }}
            >
              <span
                className="absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: mapping.onPrimary }}
              />
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
   * Near-greys carrying the palette's hue, derived rather than picked — what the suggested theme
   * builds its page, cards, borders and copy from. Any one of them can then be tweaked like every
   * other colour, in the selector's Adjust sliders.
   */
  const neutralSource = baseColor ?? paletteAccent(paletteColors) ?? "#71717a";
  const neutralHexes = useMemo(
    () =>
      deriveNeutrals(neutralSource, DEFAULT_NEUTRAL_TINT).map(
        (entry) => entry.hex,
      ),
    [neutralSource],
  );

  const [pair, setPair] = useState<ThemePair>(() =>
    suggestThemePair(paletteColors, neutralHexes, baseColor),
  );
  const [mode, setMode] = useState<Mode>("light");
  const [element, setElement] = useState<PreviewElement>("primaryButton");
  const [target, setTarget] = useState<Target>("primary");
  // Whether the selection is ringed in the previews. Cleared by a click anywhere outside them, so
  // the element can be seen bare while its colours are being tried.
  const [highlighted, setHighlighted] = useState(true);
  // Whether the colour editor is open. Clicking an element in a preview, or one of its rows,
  // opens it on that colour; clicking more of them retargets it.
  const [isEditing, setIsEditing] = useState(false);
  const previewsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!previewsRef.current?.contains(event.target as Node)) {
        setHighlighted(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  // Which component colours are switched on. Structural, so shared by both modes: a secondary
  // button that has a fill in light mode and none in dark would be two different components.
  const [enabled, setEnabled] = useState<ComponentKey[]>([]);
  // Colours chosen for them by hand, per mode. A switched-on colour with no entry here follows
  // its starting colour, so it keeps tracking the theme until someone actually picks one.
  const [componentColors, setComponentColors] = useState<
    Record<Mode, Partial<Record<ComponentKey, string>>>
  >({ light: {}, dark: {} });

  // Re-proposed whenever the palette itself changes, because a mapping onto colors that are no
  // longer in the palette isn't a theme anyone wants to keep editing. Hand-picked component
  // colours go with it for the same reason; which ones are switched on stays.
  const paletteKey = paletteColors.join(",");
  const neutralKey = neutralHexes.join(",");
  useEffect(() => {
    setPair(
      suggestThemePair(
        paletteKey ? paletteKey.split(",") : [],
        neutralKey ? neutralKey.split(",") : [],
        baseColor,
      ),
    );
    setComponentColors({ light: {}, dark: {} });
    setSlots({});
  }, [paletteKey, neutralKey, baseColor]);

  /** Every switched-on component colour as it currently resolves, per mode. */
  const components = useMemo(() => {
    const resolve = (current: Mode) =>
      Object.fromEntries(
        enabled.map((key) => [
          key,
          componentColors[current][key] ?? startingColor(key, pair[current]),
        ]),
      ) as Partial<Record<ComponentKey, string>>;
    return { light: resolve("light"), dark: resolve("dark") };
  }, [enabled, componentColors, pair]);

  const css = useMemo(() => {
    // Named for CSS as element and property, e.g. --color-secondary-button-background.
    const forCss = (resolved: Partial<Record<ComponentKey, string>>) =>
      Object.fromEntries(
        Object.entries(resolved).map(([key, hex]) => [
          key.replace(".", "-").replace(/ /g, "-"),
          hex as string,
        ]),
      );
    const exported: ComponentColors = {
      light: forCss(components.light),
      dark: forCss(components.dark),
    };
    return formatThemeCss(pair, exported);
  }, [pair, components]);

  // Every role that carries text, checked against whatever it sits on, in both modes at once —
  // the failure this tool exists to catch is a pairing that only breaks in one of them. A
  // component given a fill of its own is checked too: its label now sits on that fill, not on the
  // card behind it.
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
      for (const element of Object.keys(ELEMENTS) as PreviewElement[]) {
        const fill = components[current][componentKey(element, "Background")];
        const text = ELEMENTS[element].parts.find(
          (part) => part.property === "Primary text",
        );
        if (!fill || !text) continue;
        const ratio = contrastRatio(mapping[text.role], fill);
        if (wcagLevel(ratio) === "fail") {
          found.push({
            mode: current,
            label: `${ELEMENTS[element].label} text on its background`,
            ratio,
          });
        }
      }
    }
    return found;
  }, [pair, components]);

  /** Picking something in a preview edits that part of that element, in that mode. */
  function selectElement(
    next: PreviewElement,
    nextTarget: Target,
    nextMode: Mode,
  ) {
    setElement(next);
    setTarget(nextTarget);
    setMode(nextMode);
    setHighlighted(true);
    setIsEditing(true);
  }

  /** Switches a component colour on or off. Switching one on also selects it, ready to edit. */
  function toggleComponent(key: ComponentKey, on: boolean) {
    setEnabled((current) =>
      on ? [...current, key] : current.filter((entry) => entry !== key),
    );
    if (on) {
      setTarget(key);
      setIsEditing(true);
    } else if (target === key) {
      setTarget((ELEMENTS[element].parts[0] as { role: ThemeRoleId }).role);
    }
  }

  const currentHex = isComponentKey(target)
    ? (components[mode][target] ?? "#000000")
    : pair[mode][target];

  /**
   * Keeps the selector stretching the entry the colour started from once it is changed away from
   * it — otherwise the first nudge would match no entry and jump to a segment of its own.
   */
  const adjustKey = `${mode}:${target}`;
  function pinSlot() {
    setSlots((current) =>
      adjustKey in current ? current : { ...current, [adjustKey]: activeIndex },
    );
  }

  // Stable, so the editor's listeners aren't torn down and re-added on every render.
  const closeEditor = useCallback(() => setIsEditing(false), []);

  function assign(hex: string) {
    if (isComponentKey(target)) {
      setComponentColors((current) => ({
        ...current,
        [mode]: { ...current[mode], [target]: hex },
      }));
      return;
    }
    setPair((current) => ({
      ...current,
      [mode]: { ...current[mode], [target]: hex },
    }));
  }

  const targetProperty = isComponentKey(target)
    ? (target.split(".")[1] as Property)
    : ELEMENTS[element].parts.find((part) => part.role === target)?.property;

  const options = [
    ...new Set([
      ...paletteColors.map((hex) => hex.toLowerCase()),
      "#ffffff",
      "#000000",
    ]),
  ];

  // Which palette entry the colour being edited came from, per mode and target, so the selector
  // keeps stretching that entry while it is adjusted away from its original hex. Until one has
  // been picked here it is whichever entry the colour matches, or a segment of its own after them.
  const [slots, setSlots] = useState<Record<string, number>>({});
  const activeIndex = (() => {
    const stored = slots[adjustKey];
    if (stored !== undefined && stored < options.length) return stored;
    const match = options.indexOf(currentHex.toLowerCase());
    return match >= 0 ? match : options.length;
  })();

  /** One row of the element panel: a swatch, a name, a note and a value. */
  const row = (
    property: Property,
    hex: string,
    note: string,
    isActive: boolean,
    onSelect: () => void,
  ) => (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left transition ${
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
          {property}
        </span>
        <span className="truncate text-[11px] text-zinc-500">{note}</span>
      </span>
      <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">
        {hex}
      </span>
    </button>
  );

  return (
    <ToolColumns className="p-4">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-zinc-500">
          Click any part of a preview to customise the colours it uses.
        </p>
        <div ref={previewsRef} data-color-trigger className="flex gap-3">
          <Preview
            mapping={pair.light}
            components={components.light}
            label="Light"
            mode="light"
            activeElement={element}
            activeTarget={target}
            activeMode={mode}
            highlighted={highlighted}
            onSelect={selectElement}
          />
          <Preview
            mapping={pair.dark}
            components={components.dark}
            label="Dark"
            mode="dark"
            activeElement={element}
            activeTarget={target}
            activeMode={mode}
            highlighted={highlighted}
            onSelect={selectElement}
          />
        </div>
      </div>

      {/* Everything that paints the selected element, each one editable. An element is rarely one
          colour, so this is a list rather than a single swatch — and a role is rarely one
          element, so each row says what else it will change. Editing the card's border recolours
          nothing else; editing the secondary colour recolours both halves of its button, and
          finding that out afterwards is worse than being told. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {`${mode} mode / ${ELEMENTS[element].label}`}
        </span>
        <div data-color-trigger className="flex flex-col gap-1">
          {PROPERTIES.map((property) => {
            const part = ELEMENTS[element].parts.find(
              (candidate) => candidate.property === property,
            );
            if (part) {
              const alsoOn = elementsUsing(part.role)
                .filter((other) => other !== element)
                .map((other) => ELEMENTS[other].label.toLowerCase());
              return (
                <div key={property} className="flex">
                  {row(
                    property,
                    pair[mode][part.role],
                    alsoOn.length > 0
                      ? `Also on the ${alsoOn.join(", ")}`
                      : "Only here",
                    target === part.role,
                    () => {
                      setTarget(part.role);
                      setIsEditing(true);
                    },
                  )}
                </div>
              );
            }

            const key = componentKey(element, property);
            const canEnable = ELEMENTS[element].optional.includes(property);
            const isOn = enabled.includes(key);

            // Switched on: an ordinary editable row, with its switch beside it to turn it back off.
            if (canEnable && isOn) {
              return (
                <div key={property} className="flex items-center gap-2">
                  {row(
                    property,
                    components[mode][key] ?? "#000000",
                    "This element's own colour",
                    target === key,
                    () => {
                      setTarget(key);
                      setIsEditing(true);
                    },
                  )}
                  <Switch
                    checked
                    label={`Remove the ${ELEMENTS[element].label.toLowerCase()}'s ${property.toLowerCase()}`}
                    onChange={() => toggleComponent(key, false)}
                  />
                </div>
              );
            }

            // Absent. Always shown, in the same order, so every element reads the same way — with a
            // switch where the element could take the property, and a plain statement where it
            // has nowhere to show it.
            return (
              <div
                key={property}
                className="flex items-center gap-2 rounded-md border border-black/10 border-dashed px-2 py-1.5 dark:border-white/10"
              >
                <span className="h-5 w-5 shrink-0 rounded-md border border-black/10 border-dashed dark:border-white/10" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                    {property}
                  </span>
                  <span className="truncate text-[11px] text-zinc-400 dark:text-zinc-600">
                    {canEnable
                      ? `Not set — switch on to give the ${ELEMENTS[element].label.toLowerCase()} one`
                      : `The ${ELEMENTS[element].label.toLowerCase()} doesn't have one`}
                  </span>
                </span>
                {canEnable && (
                  <span className="ml-auto">
                    <Switch
                      checked={false}
                      label={`Give the ${ELEMENTS[element].label.toLowerCase()} a ${property.toLowerCase()}`}
                      onChange={() => toggleComponent(key, true)}
                    />
                  </span>
                )}
              </div>
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

      <ColorEditorModal
        open={isEditing}
        title={`${mode} mode / ${ELEMENTS[element].label} / ${targetProperty ?? ""}`}
        selectionKey={adjustKey}
        colors={options}
        activeIndex={activeIndex}
        value={currentHex}
        anchor={previewsRef}
        onPick={(hex, index) => {
          setSlots((current) => ({ ...current, [adjustKey]: index }));
          assign(hex);
        }}
        onChange={(hex) => {
          pinSlot();
          assign(hex);
        }}
        onClose={closeEditor}
      />

      <button
        type="button"
        onClick={() => {
          setPair(suggestThemePair(paletteColors, neutralHexes, baseColor));
          setComponentColors({ light: {}, dark: {} });
          setSlots({});
        }}
        className="cursor-pointer self-start rounded-full border border-zinc-300 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-[0.97] dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-surface-hover"
      >
        Re-suggest from palette
      </button>

      <CssOutput code={css} />
    </ToolColumns>
  );
}
