import type { PageColor } from "@echo-ui-kit/adapters";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePageInspector } from "../context/PageContext";
import { PanelColumnsProvider } from "../context/PanelLayoutContext";
import { useStorage } from "../context/StorageContext";
import { useTheme } from "../lib/theme";
import type {
  SavedColor,
  SavedPalette,
  WorkingPalette,
} from "../types/palette";
import { BoxEditor } from "./BoxEditor";
import { ContrastView } from "./ContrastView";
import { DriftView } from "./DriftView";
import { EasingEditor } from "./EasingEditor";
import { ExportView } from "./ExportView";
import { FilterPlayground } from "./FilterPlayground";
import { GradientGenerator } from "./GradientGenerator";
import { PageToolsView } from "./PageToolsView";
import { PaletteGenerator } from "./PaletteGenerator";
import { SavedPalettesView } from "./SavedPalettesView";
import { ThemeTester } from "./ThemeTester";
import { TWO_COLUMN_MIN_WIDTH } from "./ToolColumns";
import { type ToolOption, ToolSwitcher } from "./ToolSwitcher";

const SAVED_PALETTES_KEY = "palettes";
const SAVED_COLORS_KEY = "colors";
const RECENT_PALETTES_KEY = "recentPalettes";
const RECENT_COLORS_KEY = "recentColors";

// How much unsaved history to keep. Small on purpose: this is a safety net for work you haven't
// committed to yet, not an archive — anything you actually want kept has a Save button.
const RECENT_HISTORY_LIMIT = 8;

// The working palette changes on every slider tick, so recording each one would fill the history
// with near-identical junk from a single drag. Waiting for it to sit still means one entry per
// palette you actually settled on.
const WORKING_PALETTE_SETTLE_MS = 1500;

type ToolId =
  | "palette"
  | "contrast"
  | "theme"
  | "gradient"
  | "box"
  | "easing"
  | "filter"
  | "page"
  | "drift"
  | "export"
  | "saved";

// Below this a panel stops being usable — the tools are laid out for a phone-width column, and
// two cramped halves are worse than one that works.
const MIN_PANEL_WIDTH = 380;
// Three is where the returns stop: past it the panels are narrow, and nobody is watching four
// tools at once anyway.
const MAX_PANELS = 3;

// Gutter around and between the panel cards. Numbers rather than classes because the same
// figures have to come out of the width arithmetic below — a card's width is what's left of the
// shell once these are paid for.
const CARD_GAP = 12;
const CARD_PADDING = 12;

// An empty slot is an invitation, not a panel. It takes only what the open tools can spare,
// clamped so it never shrinks to a sliver or swells into a wall.
const ADD_SLOT_MIN_WIDTH = 112;
const ADD_SLOT_MAX_WIDTH = 288;

function paletteKey(colors: string[]): string {
  return colors.join(",");
}

/**
 * An unfilled slot, drawn as the card it would become.
 *
 * Dotted rather than solid so it reads as an outline of something absent — and placed where the
 * panel would actually appear, which says more about what the split does than a button in the
 * header ever did.
 */
function AddPanelSlot({
  column,
  onClick,
}: {
  column: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Open another tool beside this one"
      style={{ gridColumn: column, gridRow: "1 / -1" }}
      className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-black/15 border-dotted px-3 text-zinc-400 transition hover:border-black/30 hover:bg-black/[0.02] hover:text-zinc-600 dark:border-white/15 dark:text-zinc-500 dark:hover:border-white/30 dark:hover:bg-white/[0.03] dark:hover:text-zinc-300"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-current border-dotted">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <title>Add a panel</title>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className="text-center font-medium text-[11px] leading-tight">
        Add a tool
      </span>
    </button>
  );
}

/**
 * The whole application: tool switcher, the library that outlives any one tool, and every tool
 * itself.
 *
 * Lives in the UI package rather than in either app because there's only one of it. The two hosts
 * differ in what they can *do*, not in what the product is — the extension supplies a page
 * inspector and chrome.storage, a web build supplies localStorage and no inspector — so both
 * mount this and let the adapters decide what's available.
 */
export function AppShell() {
  const storage = useStorage();
  // Absent in a web build, which has no page to inspect. The page-dependent tools are dropped
  // from the switcher entirely rather than shown broken.
  const inspector = usePageInspector();
  // One entry per open panel, each naming the tool it shows. Duplicates are impossible by
  // construction — see openInPanel — because a tool is a single mounted component and can only
  // be in one place at a time.
  const [panels, setPanels] = useState<ToolId[]>(["palette"]);
  const [maxPanels, setMaxPanels] = useState(1);
  const [shellWidth, setShellWidth] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  // Measured from the shell itself rather than the window, because the two hosts disagree about
  // what the window means: in the extension it *is* the panel, while on the web the shell is one
  // box inside a much wider page.
  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setShellWidth(width);
      // Counting the gutters, not just the panels: n cards need n minimum widths plus the
      // padding either side and a gap between each pair, so n fits while
      // width - 2p - g(n-1) >= n * MIN_PANEL_WIDTH — solved for n below. Dividing by the
      // minimum width alone let three cards claim a 1140px window and left each one 364px.
      setMaxPanels(
        Math.min(
          MAX_PANELS,
          Math.max(
            1,
            Math.floor(
              (width - 2 * CARD_PADDING + CARD_GAP) /
                (MIN_PANEL_WIDTH + CARD_GAP),
            ),
          ),
        ),
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Dropping the overflow keeps panels from being squeezed below a usable width when the window
  // shrinks. Trimming from the end preserves the first panel, which is the one being worked in.
  useEffect(() => {
    setPanels((current) =>
      current.length > maxPanels ? current.slice(0, maxPanels) : current,
    );
  }, [maxPanels]);

  /**
   * Where the open tools sit and how wide everything ends up.
   *
   * Every slot that fits is shown, so the ones you haven't filled read as an offer rather than as
   * nothing. They flank the open tools: two spare slots put one on each side, a single spare goes
   * to the right — which is what makes a lone tool sit in the middle of a three-wide shell and to
   * the left of a two-wide one.
   *
   * The open tools get first claim on the width. They ask for enough to run two columns, and
   * settle for one if that can't be had while the empty slots still read as cards; whatever is
   * left over is theirs. Splitting the shell evenly instead would hand a lone tool a third of a
   * desktop window and spend the other two thirds on invitations.
   */
  const emptySlots = Math.max(0, maxPanels - panels.length);
  const leadingSlots = Math.floor(emptySlots / 2);
  const trailingSlots = emptySlots - leadingSlots;
  // Cards only once there is more than one slot. In the extension's side panel, and on a phone,
  // a border around the single panel would be a frame around the whole window.
  const isCarded = maxPanels > 1;
  const innerWidth = isCarded
    ? shellWidth - CARD_PADDING * 2 - CARD_GAP * (maxPanels - 1)
    : shellWidth;
  const panelTarget =
    innerWidth - emptySlots * ADD_SLOT_MIN_WIDTH >=
    panels.length * TWO_COLUMN_MIN_WIDTH
      ? TWO_COLUMN_MIN_WIDTH
      : TWO_COLUMN_MIN_WIDTH / 2;
  const addSlotWidth =
    emptySlots === 0
      ? 0
      : Math.round(
          Math.min(
            ADD_SLOT_MAX_WIDTH,
            Math.max(
              ADD_SLOT_MIN_WIDTH,
              (innerWidth - panels.length * panelTarget) / emptySlots,
            ),
          ),
        );
  const panelWidth =
    (innerWidth - emptySlots * addSlotWidth) / Math.max(1, panels.length);
  const panelColumns = panelWidth >= TWO_COLUMN_MIN_WIDTH ? 2 : 1;

  const [savedPalettes, setSavedPalettes] = useState<SavedPalette[]>([]);
  const [savedColors, setSavedColors] = useState<SavedColor[]>([]);
  // The palette currently being built in the Palette tool, lifted up here so the Contrast and
  // Export tools can read it. They're siblings, not children, of the generator — without this
  // they'd only ever see *saved* palettes, and you'd have to save a half-finished palette just
  // to check whether its colors contrast well enough to be worth saving.
  const [workingPalette, setWorkingPalette] = useState<WorkingPalette | null>(
    null,
  );
  // A saved palette waiting to be restored into the generator. Cleared as soon as the generator
  // acknowledges it, so picking the *same* palette again is still a distinct request rather than
  // an unchanged prop that nothing reacts to.
  const [paletteToLoad, setPaletteToLoad] = useState<SavedPalette | null>(null);
  // Unsaved history — palettes you settled on and colors you clicked, kept so work you didn't
  // explicitly save isn't simply gone.
  const [recentPalettes, setRecentPalettes] = useState<SavedPalette[]>([]);
  const [recentColors, setRecentColors] = useState<SavedColor[]>([]);
  // Guards the persistence effects below: without it their first run (with empty initial state)
  // would write over stored history before the load had a chance to populate it.
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  const workingColors = useMemo(
    () => workingPalette?.colors ?? [],
    [workingPalette],
  );
  const workingBaseColors = useMemo(
    () => workingPalette?.columns ?? [],
    [workingPalette],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      storage.get<SavedPalette[]>(SAVED_PALETTES_KEY),
      storage.get<SavedColor[]>(SAVED_COLORS_KEY),
      storage.get<SavedPalette[]>(RECENT_PALETTES_KEY),
      storage.get<SavedColor[]>(RECENT_COLORS_KEY),
    ]).then(([palettes, colors, recentP, recentC]) => {
      if (cancelled) return;
      setSavedPalettes(palettes ?? []);
      setSavedColors(colors ?? []);
      setRecentPalettes(recentP ?? []);
      setRecentColors(recentC ?? []);
      setIsStorageLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    if (!isStorageLoaded) return;
    storage.set(RECENT_PALETTES_KEY, recentPalettes);
  }, [isStorageLoaded, recentPalettes, storage]);

  useEffect(() => {
    if (!isStorageLoaded) return;
    storage.set(RECENT_COLORS_KEY, recentColors);
  }, [isStorageLoaded, recentColors, storage]);

  // Records the working palette once it's stopped changing. Deduped by its color list, so
  // returning to a palette already in the history moves it back to the front rather than
  // stacking up copies of the same thing.
  useEffect(() => {
    if (!workingPalette || workingPalette.colors.length === 0) return;
    const timer = setTimeout(() => {
      const key = paletteKey(workingPalette.colors);
      setRecentPalettes((current) => {
        if (current[0] && paletteKey(current[0].colors) === key) return current;
        return [
          {
            baseColor: workingPalette.baseColor,
            harmony: workingPalette.harmony,
            colors: workingPalette.colors,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          },
          ...current.filter((p) => paletteKey(p.colors) !== key),
        ].slice(0, RECENT_HISTORY_LIMIT);
      });
    }, WORKING_PALETTE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [workingPalette]);

  function handleColorFocused(hex: string) {
    setRecentColors((current) => {
      if (current[0]?.hex === hex) return current;
      return [
        {
          hex,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        },
        ...current.filter((c) => c.hex !== hex),
      ].slice(0, RECENT_HISTORY_LIMIT);
    });
  }

  // The single place that actually writes "palettes" to storage — PaletteGenerator only hands
  // back what it built, so there's one source of truth for the saved list, shared by the tool
  // switcher's count and SavedPalettesView, both of which would otherwise have no way to find
  // out a save happened elsewhere.
  async function handleSavePalette(
    entry: Omit<SavedPalette, "id" | "createdAt">,
  ) {
    const palette: SavedPalette = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const next = [...savedPalettes, palette];
    setSavedPalettes(next);
    await storage.set(SAVED_PALETTES_KEY, next);
  }

  async function handleDeletePalette(id: string) {
    const next = savedPalettes.filter((p) => p.id !== id);
    setSavedPalettes(next);
    await storage.set(SAVED_PALETTES_KEY, next);
  }

  // Same pattern as palettes, one storage key over — a color saved from PaletteGenerator's
  // selected-color footer lands here and nowhere else needs to know about persistence.
  async function handleSaveColor(hex: string) {
    const color: SavedColor = {
      hex,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const next = [...savedColors, color];
    setSavedColors(next);
    await storage.set(SAVED_COLORS_KEY, next);
  }

  async function handleDeleteColor(id: string) {
    const next = savedColors.filter((c) => c.id !== id);
    setSavedColors(next);
    await storage.set(SAVED_COLORS_KEY, next);
  }

  function handleDismissRecentPalette(id: string) {
    setRecentPalettes((current) => current.filter((p) => p.id !== id));
  }

  function handleDismissRecentColor(id: string) {
    setRecentColors((current) => current.filter((c) => c.id !== id));
  }

  // Stable identity because PaletteGenerator lists these in effect dependencies — a fresh closure
  // every render would make those effects re-run on every render.
  const handlePaletteLoaded = useCallback(() => setPaletteToLoad(null), []);
  const handleWorkingPaletteChange = useCallback(
    (palette: WorkingPalette) => setWorkingPalette(palette),
    [],
  );

  // Drift needs the same page scan the page tool runs, so it's owned here — otherwise opening
  // Drift would rescan a page that was just scanned next door.
  const [pageColors, setPageColors] = useState<PageColor[]>([]);
  const [isScanningPage, setIsScanningPage] = useState(false);

  async function scanPageColors() {
    setIsScanningPage(true);
    try {
      setPageColors((await inspector?.extractColors()) ?? []);
    } catch {
      // Silent: the page tool surfaces inspection failures with the context to explain them,
      // and duplicating that here would mean two banners for one problem.
      setPageColors([]);
    } finally {
      setIsScanningPage(false);
    }
  }

  // Colors scraped off a page arrive as a flat list with no base color or harmony behind them,
  // which is exactly the shape an image-extracted palette has — so it loads through the same
  // path rather than needing its own.
  function handleUsePageColors(hexes: string[]) {
    if (hexes.length === 0) return;
    setPaletteToLoad({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      baseColor: hexes[0] as string,
      harmony: "image",
      colors: hexes,
    });
    focusTool("palette");
  }

  // "Edit" is "select" plus taking you to where editing actually happens. Both make the palette
  // active for the contrast and export tools; only this one moves you off this view.
  function handleEditPalette(palette: SavedPalette) {
    setPaletteToLoad(palette);
    focusTool("palette");
  }

  const savedCount = savedPalettes.length + savedColors.length;

  // Grouped so the menu stays scannable as the tool count grows, and because the grouping says
  // something real: "Palette" tools all operate on the working palette, "CSS" tools are
  // standalone generators that don't care whether a palette exists. Descriptions carry live
  // counts where there is one, so the menu doubles as a status readout.
  const tools = useMemo<ToolOption[]>(
    () => [
      {
        id: "palette",
        label: "Palette",
        group: "Palette",
        description: "Build a palette from a color or an image",
      },
      {
        id: "contrast",
        label: "Contrast",
        group: "Palette",
        description: "Check pairs, or text over a screenshot",
      },
      {
        id: "theme",
        label: "Theme",
        group: "Palette",
        description: "Map the palette into light and dark, side by side",
      },
      {
        id: "export",
        label: "Export",
        group: "Palette",
        description: "Copy as CSS, Tailwind, SCSS, or JSON",
      },
      {
        id: "gradient",
        label: "Gradient",
        group: "CSS",
        description: "Linear, radial, and conic with live stops",
      },
      {
        id: "box",
        label: "Box",
        group: "CSS",
        description: "Size, corners, and shadow on one element",
      },
      {
        id: "filter",
        label: "Filter",
        group: "CSS",
        description: "Blur, saturate, invert, and the rest",
      },
      {
        id: "easing",
        label: "Easing",
        group: "Motion",
        description: "Drag a cubic-bezier curve and watch it run",
      },
      ...(inspector
        ? [
            {
              id: "page",
              label: "Inspect page",
              group: "Page",
              description: "Box model, colors, and fonts from the live tab",
            },
          ]
        : []),
      {
        id: "drift",
        label: "Drift",
        group: inspector ? "Page" : "Palette",
        description: inspector
          ? "Find colors that nearly match your saved palette"
          : "Paste CSS to find colors that nearly match your palette",
      },
      {
        id: "saved",
        label: "Saved",
        group: "Library",
        description:
          savedCount > 0
            ? `${savedCount} saved color${savedCount === 1 ? "" : "s"} and palettes`
            : "Your saved colors and palettes",
      },
    ],
    [savedCount, inspector],
  );

  /**
   * Places a tool in a panel.
   *
   * If it's already open elsewhere the two panels trade contents rather than both claiming it.
   * Each tool is mounted exactly once — that's what lets its state survive being switched away
   * from — so "show it in two places" isn't something the layout can express.
   */
  function openInPanel(index: number, id: ToolId) {
    setPanels((current) => {
      const next = [...current];
      const existing = current.indexOf(id);
      if (existing !== -1 && existing !== index) {
        next[existing] = current[index] as ToolId;
      }
      next[index] = id;
      return next;
    });
  }

  /** Brings a tool into view without disturbing the others — used when an action in one panel
   *  needs to hand off to a specific tool. */
  function focusTool(id: ToolId) {
    setPanels((current) => {
      if (current.includes(id)) return current;
      const next = [...current];
      next[0] = id;
      return next;
    });
  }

  /** Fills an empty slot, on whichever side of the open tools it was showing. */
  function addPanel(side: "leading" | "trailing") {
    setPanels((current) => {
      if (current.length >= maxPanels) return current;
      const unused = tools.find((t) => !current.includes(t.id as ToolId));
      if (!unused) return current;
      const id = unused.id as ToolId;
      return side === "leading" ? [id, ...current] : [...current, id];
    });
  }

  function closePanel(index: number) {
    setPanels((current) =>
      current.length <= 1 ? current : current.filter((_, i) => i !== index),
    );
  }

  /**
   * Wraps one tool in its grid cell.
   *
   * Every tool is a direct child of the same grid and only ever changes which *column* it sits
   * in. That matters: moving a tool between panels by re-parenting it would unmount and remount
   * it, throwing away the palette you were part-way through building. Changing a grid-column
   * leaves the element exactly where React thinks it is.
   */
  function slot(id: ToolId, node: ReactNode, scrolls = true) {
    const index = panels.indexOf(id);
    const isOpen = index !== -1;
    return (
      <div
        key={id}
        style={{
          gridColumn: leadingSlots + (isOpen ? index : 0) + 1,
          gridRow: 2,
        }}
        // Transparent: the card it sits on is a separate grid child underneath. Only the
        // matching bottom corners are needed here, so scrolled content is clipped by the same
        // curve the card draws rather than painting over it.
        className={
          isOpen
            ? `${scrolls ? "overflow-y-auto" : "flex flex-col"} min-h-0 ${
                isCarded ? "rounded-b-xl" : ""
              }`
            : "hidden"
        }
      >
        {/* Full width on purpose — the scrollbar belongs at the panel's edge, not floating in
            the middle of it. Capping and centring the content is the tool's own job, because how
            much width it can use depends on whether it splits into columns. */}
        <div className={scrolls ? "" : "flex h-full min-h-0 flex-col"}>
          {node}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className="flex h-screen flex-col bg-white text-zinc-900 dark:bg-surface dark:text-zinc-50"
    >
      <header className="flex shrink-0 items-center gap-2.5 border-black/10 border-b px-4 py-3 dark:border-white/10">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
          E
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-none">
          <h1 className="truncate text-sm font-semibold">Echo UI Kit</h1>
          <span className="truncate text-[11px] text-zinc-500">
            Front-end dev toolkit
          </span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-black/10 text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
        >
          {theme === "dark" ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <title>Sun</title>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <title>Moon</title>
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          )}
        </button>
      </header>

      <PanelColumnsProvider value={panelColumns}>
        <div
          className={`grid min-h-0 flex-1 ${
            isCarded ? "bg-zinc-100 dark:bg-black/25" : ""
          }`}
          style={{
            // Empty slots take a measured width, open tools share what is left. Written out
            // track by track rather than as a repeat() because the two kinds of column are
            // sized on completely different terms.
            gridTemplateColumns: [
              ...Array(leadingSlots).fill(`${addSlotWidth}px`),
              ...Array(panels.length).fill("minmax(0, 1fr)"),
              ...Array(trailingSlots).fill(`${addSlotWidth}px`),
            ].join(" "),
            // The header row sizes to its content, the tool row takes the rest. minmax(0, 1fr)
            // rather than 1fr so a tool's own scroll container can shrink instead of stretching
            // the row to fit everything inside it.
            gridTemplateRows: "auto minmax(0, 1fr)",
            gap: isCarded ? CARD_GAP : 0,
            padding: isCarded ? CARD_PADDING : 0,
          }}
        >
          {/* One card per open tool, spanning its header and its body. Drawn as a single
              element beneath both rather than as a border on each, because a shadow split
              across two stacked boxes casts onto its own other half. Rendered first so it
              paints underneath, and inert so it never intercepts anything. */}
          {isCarded &&
            panels.map((_, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: a card is a position, not an entity
                key={`card-${index}`}
                style={{
                  gridColumn: leadingSlots + index + 1,
                  gridRow: "1 / -1",
                }}
                className="pointer-events-none rounded-xl border border-black/10 bg-white shadow-black/[0.06] shadow-md dark:border-white/10 dark:bg-surface dark:shadow-black/40 dark:shadow-xl"
              />
            ))}

          {panels.map((panelTool, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a panel is a position, not an entity — index is its identity
              key={`panel-${index}`}
              style={{ gridColumn: leadingSlots + index + 1, gridRow: 1 }}
              className="flex items-center gap-2 border-black/10 border-b px-3 py-2 dark:border-white/10"
            >
              <ToolSwitcher
                tools={tools}
                activeId={panelTool}
                onChange={(id) => openInPanel(index, id as ToolId)}
              />
              {panels.length > 1 && (
                <button
                  type="button"
                  onClick={() => closePanel(index)}
                  title="Close this panel"
                  className="ml-auto flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-90 dark:hover:bg-surface-elevated dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {Array.from({ length: leadingSlots }, (_, index) => (
            <AddPanelSlot
              // biome-ignore lint/suspicious/noArrayIndexKey: a slot is a position, not an entity
              key={`leading-${index}`}
              column={index + 1}
              onClick={() => addPanel("leading")}
            />
          ))}
          {Array.from({ length: trailingSlots }, (_, index) => (
            <AddPanelSlot
              // biome-ignore lint/suspicious/noArrayIndexKey: a slot is a position, not an entity
              key={`trailing-${index}`}
              column={leadingSlots + panels.length + index + 1}
              onClick={() => addPanel("trailing")}
            />
          ))}

          {/* Every tool is mounted once and merely hidden when no panel holds it — a conditional
          render would unmount whichever isn't showing, wiping its state (the palette being built,
          included) every time you switched away. */}
          {slot(
            "palette",
            <PaletteGenerator
              onSave={handleSavePalette}
              onSaveColor={handleSaveColor}
              onWorkingPaletteChange={handleWorkingPaletteChange}
              onColorFocused={handleColorFocused}
              paletteToLoad={paletteToLoad}
              onPaletteLoaded={handlePaletteLoaded}
            />,
            // Manages its own scroll region and pinned footer, so it needs to be a flex column
            // rather than a scroll container.
            false,
          )}
          {slot("contrast", <ContrastView colors={workingColors} />)}
          {slot("theme", <ThemeTester paletteColors={workingColors} />)}
          {slot("box", <BoxEditor paletteColors={workingColors} />)}
          {slot(
            "gradient",
            <GradientGenerator paletteColors={workingColors} />,
          )}
          {slot("filter", <FilterPlayground paletteColors={workingColors} />)}
          {slot("easing", <EasingEditor />)}
          {inspector &&
            slot(
              "page",
              <PageToolsView
                isActive={panels.includes("page")}
                onUseColors={handleUsePageColors}
              />,
              false,
            )}
          {slot(
            "drift",
            <DriftView
              palettes={savedPalettes}
              pageCandidates={inspector ? pageColors : undefined}
              onScanPage={inspector ? scanPageColors : undefined}
              isScanning={isScanningPage}
            />,
          )}
          {slot(
            "export",
            <ExportView
              colors={workingColors}
              baseColors={workingBaseColors}
            />,
          )}
          {slot(
            "saved",
            <SavedPalettesView
              palettes={savedPalettes}
              onDeletePalette={handleDeletePalette}
              onSelectPalette={setPaletteToLoad}
              onEditPalette={handleEditPalette}
              onSavePalette={handleSavePalette}
              colors={savedColors}
              onDeleteColor={handleDeleteColor}
              onSaveColor={handleSaveColor}
              recentPalettes={recentPalettes}
              onDismissRecentPalette={handleDismissRecentPalette}
              recentColors={recentColors}
              onDismissRecentColor={handleDismissRecentColor}
            />,
          )}
        </div>
      </PanelColumnsProvider>
    </div>
  );
}
