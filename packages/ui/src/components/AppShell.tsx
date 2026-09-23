import type { PageColor } from "@echo-ui-kit/adapters";
import {
  type CSSProperties,
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
import { useAppTheme } from "../lib/appTheme";
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
import { ThemeMenu } from "./ThemeMenu";
import { ThemeTester } from "./ThemeTester";
import { TWO_COLUMN_MIN_WIDTH } from "./ToolColumns";
import { type ToolOption, ToolSwitcher } from "./ToolSwitcher";

const SAVED_PALETTES_KEY = "palettes";
const SAVED_COLORS_KEY = "colors";
const RECENT_PALETTES_KEY = "recentPalettes";
const RECENT_COLORS_KEY = "recentColors";
const LAYOUT_KEY = "layout";
const APP_THEME_KEY = "appTheme";

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

// An empty slot is an invitation, not a panel: a fixed rail, wide enough to read as a card and
// narrow enough that the open tools keep the window.
const ADD_SLOT_WIDTH = 100;

// How long a column takes to grow into a panel or collapse back to a rail. The one moment the
// layout rearranges itself, so it wants to be watchable — but it is also in the way of the tool
// you just asked for, which puts the ceiling somewhere under half a second.
const LAYOUT_TRANSITION_MS = 450;

// A dragged panel easing into the slot it was dropped on, which is a different kind of motion —
// it finishes a gesture the pointer already made, so it has to keep up with the hand rather than
// take its time.
const DRAG_SETTLE_MS = 220;

// The contents' own fade, at either end. Opening and closing are then exact mirrors: a fade and
// a slide each way, the same length in both directions.
const PANEL_CONTENT_MS = 220;

// How long the panel spends fading before its slot is actually emptied — see panel-out.
const PANEL_EXIT_MS = PANEL_CONTENT_MS;

function paletteKey(colors: string[]): string {
  return colors.join(",");
}

/**
 * Lays a set of open tools out across a given number of slots, spreading the empty ones around
 * them: two spare put one on each side, a single spare goes to the right. That is what centres a
 * lone tool in a three-wide shell and sits it to the left of a two-wide one.
 */
function spreadSlots(open: ToolId[], count: number): (ToolId | null)[] {
  const kept = open.slice(0, count);
  const empty = count - kept.length;
  const leading = Math.floor(empty / 2);
  return [
    ...Array<ToolId | null>(leading).fill(null),
    ...kept,
    ...Array<ToolId | null>(empty - leading).fill(null),
  ];
}

/**
 * Turns a layout read back from storage into one this shell can actually render.
 *
 * Exact positions are kept when the window still has the same number of slots, which is the
 * common case and the whole point of saving it. Otherwise the tools are re-spread over however
 * many there are now.
 *
 * Everything else here is guarding an invariant against a store that may not honour it. A tool
 * id that no longer exists — "page", saved from the extension and read back in a web build —
 * has to be dropped rather than rendered as a panel with nothing in it. A duplicate has to go
 * too: a tool is a single mounted component, so a second slot claiming it would draw a header
 * with no body while the first drew the body.
 */
function restoreSlots(
  saved: unknown,
  count: number,
  available: ReadonlySet<string>,
): (ToolId | null)[] | null {
  if (!Array.isArray(saved)) return null;
  const seen = new Set<string>();
  const cleaned = saved.map((id) => {
    if (typeof id !== "string" || !available.has(id) || seen.has(id)) {
      return null;
    }
    seen.add(id);
    return id as ToolId;
  });
  const open = cleaned.filter((id): id is ToolId => id !== null);
  if (open.length === 0) return null;
  if (cleaned.length === count) return cleaned;
  return spreadSlots(open, count);
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
  style,
  isEntering,
  onClick,
}: {
  column: number;
  style?: CSSProperties;
  /** Only when this slot has just become empty. Fading on every mount would flash the rail on
   *  its way past during a drag, where it was already on screen the whole time. */
  isEntering: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Open another tool beside this one"
      style={{ gridColumn: column, gridRow: "1 / -1", ...style }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-black/15 border-dotted px-3 text-zinc-400 transition hover:border-black/30 hover:bg-black/[0.02] hover:text-zinc-600 dark:border-white/15 dark:text-zinc-500 dark:hover:border-white/30 dark:hover:bg-white/[0.03] dark:hover:text-zinc-300 ${
        isEntering ? "animate-panel-card-in" : ""
      }`}
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
      <span className="text-center font-medium text-[10px] leading-tight">
        Add
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
  /**
   * One entry per slot the shell has room for, naming the tool in it or null if it's empty.
   *
   * Positions rather than a list of open tools, so a slot you fill stays where you clicked and a
   * panel you drag lands where you dropped it. Deriving the arrangement from a count instead
   * would re-centre everything on every change: filling the right-hand slot would slide the tool
   * you were working in sideways. Duplicates are impossible by construction — see openInPanel —
   * because a tool is a single mounted component and can only be in one place at a time.
   */
  const [slots, setSlots] = useState<(ToolId | null)[]>(["palette"]);
  const [maxPanels, setMaxPanels] = useState(1);
  const [shellWidth, setShellWidth] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  /**
   * The slot currently opening, and whether its column has finished growing.
   *
   * Until it has, the panel's contents aren't rendered at all — not merely transparent. An
   * element at zero opacity is still laid out, so leaving the tool in the tree meant reflowing
   * every slider, swatch and canvas in it through each of the forty-odd widths the card passes
   * through on the way open. That is the whole difference between opening and closing: closing
   * has already taken its contents out of the tree before the column starts to move.
   */
  const [entering, setEntering] = useState<{
    /** Slots whose contents are arriving — a different tool, or the first one. */
    contents: number[];
    /** Slots whose card and header are arriving too, because they were empty rails. */
    panels: number[];
    revealed: boolean;
  } | null>(null);
  // A rail that has just appeared, so it can fade in rather than blink into place.
  const [enteringRail, setEnteringRail] = useState<number | null>(null);
  // A layout read back from storage, held until the shell has been measured — how many slots it
  // has to be fitted into isn't known until then, and on the web the read resolves first.
  const [pendingLayout, setPendingLayout] = useState<unknown>(null);
  // Guards the write-back below from saving the default layout over the stored one in the gap
  // between the read landing and the restore being applied.
  const [isLayoutRestored, setIsLayoutRestored] = useState(false);
  // Whether the palette being built is also painting the interface around it. On by default: a
  // tool for making palettes that doesn't use the one you just made is a worse demonstration of
  // it than any amount of preview, and it is one switch away in the theme menu.
  const [isAppThemed, setIsAppThemed] = useState(true);
  /**
   * A slot change that hasn't been applied yet, held for the length of the fade.
   *
   * The slots keep their current tools throughout it — applying the change first would swap the
   * contents and then fade in something that was already on screen.
   *
   * The whole row rather than one index, because a change can touch two slots at once: picking a
   * tool that's already open somewhere else makes the two panels trade contents.
   */
  const [pending, setPending] = useState<{
    next: (ToolId | null)[];
    changed: number[];
    /** Of those, the ones that were empty rails — recorded now, because by the time this is
     *  applied the row it was measured against is the row being replaced. */
    arriving: number[];
  } | null>(null);
  // The tracks move for two different reasons and only one of them should animate. Opening,
  // closing and reordering are discrete changes worth watching; a window being dragged is a
  // continuous one, where easing each step would turn the row into a lagging rubber band. So the
  // transition is always on and suppressed while a resize is in flight, rather than armed around
  // each change — nothing to arm means nothing that can fail to be armed in time.
  const [isResizing, setIsResizing] = useState(false);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drag, setDrag] = useState<{
    from: number;
    over: number;
    pointerId: number;
    startX: number;
    dx: number;
    /** Released, easing the rest of the way to the slot it was dropped on. */
    settling?: boolean;
  } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  // Measured from the shell itself rather than the window, because the two hosts disagree about
  // what the window means: in the extension it *is* the panel, while on the web the shell is one
  // box inside a much wider page.
  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setShellWidth(width);
      setIsResizing(true);
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      // Long enough to span the gap between two frames of a drag, short enough that the
      // transition is back before you could click anything.
      resizeTimer.current = setTimeout(() => setIsResizing(false), 160);
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
    return () => {
      observer.disconnect();
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
    };
  }, []);

  // Re-lays the row whenever the number of slots changes, keeping the open tools in order and
  // spreading the empty ones around them: two spare put one on each side, a single spare goes to
  // the right. That's what centres a lone tool in a three-wide shell and sits it to the left of a
  // two-wide one. Tools past the new limit are dropped from the end, preserving the first — the
  // one being worked in.
  useEffect(() => {
    setSlots((current) =>
      current.length === maxPanels
        ? current
        : spreadSlots(
            current.filter((slot): slot is ToolId => slot !== null),
            maxPanels,
          ),
    );
  }, [maxPanels]);

  /**
   * Applies a slot change once what was in it has faded, then fades in what replaced it.
   *
   * A slot is emptied rather than removed — the slot is a position, and the others shouldn't
   * shuffle along because one of them was closed.
   */
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setSlots(pending.next);
      const filled = pending.changed.filter(
        (index) => pending.next[index] !== null,
      );
      const emptied = pending.changed.find(
        (index) => pending.next[index] === null,
      );
      // Straight past the growth beat: the column is already the width it needs to be, so there
      // is nothing for the contents to wait out. Only a slot opening from a rail has that.
      setEntering(
        filled.length > 0
          ? {
              contents: filled,
              // Only the slots that were rails get their card and header faded in; a slot that
              // merely changed tool already has both, and fading them would blink the panel.
              panels: pending.arriving,
              revealed: true,
            }
          : null,
      );
      setEnteringRail(emptied ?? null);
      setPending(null);
    }, PANEL_EXIT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  /**
   * Walks an opening panel through its two beats: wait out the column's growth with the card
   * empty, then put the contents in and let them fade.
   */
  useEffect(() => {
    if (!entering) return;
    const { contents, panels, revealed } = entering;
    const timer = setTimeout(
      () => setEntering(revealed ? null : { contents, panels, revealed: true }),
      revealed ? PANEL_CONTENT_MS + 60 : LAYOUT_TRANSITION_MS,
    );
    return () => clearTimeout(timer);
  }, [entering]);

  // One-shot: arms the rail's fade and then gets out of its way.
  useEffect(() => {
    if (enteringRail === null) return;
    const timer = setTimeout(
      () => setEnteringRail(null),
      PANEL_CONTENT_MS + 60,
    );
    return () => clearTimeout(timer);
  }, [enteringRail]);

  /**
   * How wide everything ends up.
   *
   * Empty slots take a fixed rail; the open tools divide what's left. Splitting the shell evenly
   * between all the slots instead would hand a lone tool a third of a desktop window and spend
   * the other two thirds on invitations.
   */
  const openCount = slots.filter((slot) => slot !== null).length;
  const emptySlots = slots.length - openCount;
  // Cards only once there is more than one slot. In the extension's side panel, and on a phone,
  // a border around the single panel would be a frame around the whole window.
  const isCarded = slots.length > 1;
  const innerWidth = isCarded
    ? shellWidth - CARD_PADDING * 2 - CARD_GAP * (slots.length - 1)
    : shellWidth;
  const panelWidth = Math.max(
    0,
    (innerWidth - emptySlots * ADD_SLOT_WIDTH) / Math.max(1, openCount),
  );
  // Pixels rather than fr for every track, so the row can be transitioned: a track list only
  // interpolates against another of the same length and kind, and px-against-fr is neither.
  const slotWidths = slots.map((slot) =>
    slot === null ? ADD_SLOT_WIDTH : panelWidth,
  );
  // Where each slot starts, measured from the grid's own left edge — what a drag in progress is
  // compared against to work out which slot it's over.
  const slotOffsets: number[] = [];
  {
    let x = isCarded ? CARD_PADDING : 0;
    for (const width of slotWidths) {
      slotOffsets.push(x);
      x += width + CARD_GAP;
    }
  }
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
  // Recolours the interface from the palette being built in it, live. Returns the accent it
  // actually painted with, which a pale palette does not get to choose — see deriveAppTheme.
  useAppTheme(workingColors, isAppThemed);
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
      storage.get<unknown>(LAYOUT_KEY),
      storage.get<boolean>(APP_THEME_KEY),
    ]).then(([palettes, colors, recentP, recentC, layout, appThemed]) => {
      if (cancelled) return;
      setSavedPalettes(palettes ?? []);
      setSavedColors(colors ?? []);
      setRecentPalettes(recentP ?? []);
      setRecentColors(recentC ?? []);
      // The most recent entry is the palette that was on screen when you left — recent history
      // already records the working palette once it settles, so there's nothing extra to store.
      // Handed to the generator the same way a saved palette is, since by this point that's all
      // the difference between them.
      if (recentP?.[0]) setPaletteToLoad(recentP[0]);
      if (layout) setPendingLayout(layout);
      else setIsLayoutRestored(true);
      // Checked for a stored boolean rather than truthiness, now that the default is on: a
      // stored `false` is a decision to turn it off and has to survive a reload.
      if (typeof appThemed === "boolean") setIsAppThemed(appThemed);
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

  useEffect(() => {
    if (!isStorageLoaded) return;
    storage.set(APP_THEME_KEY, isAppThemed);
  }, [isStorageLoaded, isAppThemed, storage]);

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

  // Which ids a restored layout is allowed to name. Derived from the tool list rather than the
  // ToolId union, because the union is what could exist and this is what does: the page tools
  // are absent in a web build.
  const availableTools = useMemo(
    () => new Set(tools.map((tool) => tool.id)),
    [tools],
  );

  /**
   * Applies a stored layout, once the shell has been measured.
   *
   * Declared down here rather than beside the read it completes, because it needs the tool list
   * to vet what it found and hooks can't reference a binding declared below them.
   */
  useEffect(() => {
    if (pendingLayout === null || shellWidth === 0) return;
    const restored = restoreSlots(pendingLayout, maxPanels, availableTools);
    if (restored) setSlots(restored);
    setPendingLayout(null);
    setIsLayoutRestored(true);
  }, [pendingLayout, shellWidth, maxPanels, availableTools]);

  // Saved on every change rather than on unload: a side panel is closed by closing the window
  // around it, and an unload handler is the one thing that isn't reliably run when that happens.
  useEffect(() => {
    if (!isLayoutRestored) return;
    storage.set(LAYOUT_KEY, slots);
  }, [isLayoutRestored, slots, storage]);

  /**
   * Places a tool in a panel.
   *
   * If it's already open elsewhere the two panels trade contents rather than both claiming it.
   * Each tool is mounted exactly once — that's what lets its state survive being switched away
   * from — so "show it in two places" isn't something the layout can express.
   */
  function openInPanel(index: number, id: ToolId) {
    const next = [...slots];
    const existing = slots.indexOf(id);
    if (existing !== -1 && existing !== index) {
      next[existing] = slots[index] ?? null;
    }
    next[index] = id;
    beginSlotChange(next);
  }

  /**
   * Fades out whatever is in the slots that are about to change, and applies the change once it
   * has gone. A tool appearing in place of another between two frames reads as the panel having
   * been replaced rather than as having switched — the fade is what says it is the same panel
   * showing something else.
   */
  function beginSlotChange(next: (ToolId | null)[]) {
    const changed = next.reduce<number[]>((indices, tool, index) => {
      if (tool !== slots[index]) indices.push(index);
      return indices;
    }, []);
    if (changed.length === 0) return;
    setPending({
      next,
      changed,
      arriving: changed.filter(
        (index) => slots[index] === null && next[index] !== null,
      ),
    });
  }

  /** Brings a tool into view without disturbing the others — used when an action in one panel
   *  needs to hand off to a specific tool. */
  function focusTool(id: ToolId) {
    if (slots.includes(id)) return;
    const next = [...slots];
    // An empty slot first, so handing off doesn't evict a tool that's in use.
    const target = slots.indexOf(null);
    next[target === -1 ? 0 : target] = id;
    beginSlotChange(next);
  }

  /** Fills the slot that was clicked, leaving every other slot exactly where it is. */
  function addPanel(index: number) {
    const unused = tools.find((t) => !slots.includes(t.id as ToolId));
    if (!unused) return;
    setSlots((current) => {
      const next = [...current];
      next[index] = unused.id as ToolId;
      return next;
    });
    setEntering({ contents: [index], panels: [index], revealed: false });
  }

  /** Starts the panel fading. The slot is emptied by the effect below, once it has. */
  function closePanel(index: number) {
    if (openCount <= 1 || pending) return;
    const next = [...slots];
    next[index] = null;
    beginSlotChange(next);
  }

  /**
   * Dragging a panel by its header swaps it with whatever slot it's dropped on.
   *
   * A swap rather than an insert-and-shift, because with two or three slots there's no
   * meaningful difference and a swap can't leave a hole. The dragged panel tracks the pointer
   * exactly while the one it displaces slides the other way, so by the time you let go both are
   * already where they'll end up and nothing jumps on release.
   */
  function slotAtClientX(clientX: number): number {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left;
    for (let index = slotOffsets.length - 1; index > 0; index--) {
      if (x >= (slotOffsets[index] as number)) return index;
    }
    return 0;
  }

  function startPanelDrag(index: number, event: React.PointerEvent) {
    // Anything clickable in the header keeps its click: the switcher and the close button are
    // the two things you'd otherwise never be able to press.
    if ((event.target as HTMLElement).closest("button")) return;
    if (slots.length < 2 || drag?.settling) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      from: index,
      over: index,
      pointerId: event.pointerId,
      startX: event.clientX,
      dx: 0,
    });
  }

  function movePanelDrag(event: React.PointerEvent) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag({
      ...drag,
      dx: event.clientX - drag.startX,
      over: slotAtClientX(event.clientX),
    });
  }

  function endPanelDrag(event: React.PointerEvent) {
    if (!drag || drag.pointerId !== event.pointerId || drag.settling) return;
    const { from, over } = drag;
    if (from === over) {
      setDrag(null);
      return;
    }

    const commit = () => {
      setSlots((current) => {
        const next = [...current];
        next[from] = current[over] ?? null;
        next[over] = current[from] ?? null;
        return next;
      });
      setDrag(null);
    };

    // Two open panels are the same width, so the dragged one can be eased the rest of the way
    // and the swap committed underneath it once it has arrived — it is already sitting over its
    // new slot when it changes columns, and nothing visibly jumps.
    //
    // A panel traded with an empty rail can't do that: the rail's track is a fraction of the
    // panel's width, so a panel eased into place there would be committed into a 100px column
    // and squeeze before growing back. That one commits straight away and lets the widths
    // themselves carry the move.
    if (slots[from] !== null && slots[over] !== null) {
      setDrag({
        ...drag,
        settling: true,
        dx: (slotOffsets[over] as number) - (slotOffsets[from] as number),
      });
      settleTimer.current = setTimeout(commit, DRAG_SETTLE_MS);
      return;
    }
    commit();
  }

  /**
   * The transform and stacking a slot needs while a drag is running.
   *
   * Two slots move: the one being dragged, pinned to the pointer, and the one it would displace,
   * sliding into the space being vacated. Easing the dragged panel would make it lag behind the
   * cursor, so it only eases once released.
   */
  function dragStyle(index: number): CSSProperties | undefined {
    if (!drag) return undefined;
    const offset =
      index === drag.from
        ? drag.dx
        : index === drag.over && drag.over !== drag.from
          ? (slotOffsets[drag.from] as number) -
            (slotOffsets[drag.over] as number)
          : 0;
    if (offset === 0) return undefined;
    return {
      transform: `translateX(${offset}px)`,
      zIndex: index === drag.from ? 20 : 10,
      transition:
        index === drag.from && !drag.settling
          ? "none"
          : `transform ${DRAG_SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`,
    };
  }

  /** Opening, with its column still growing — nothing of the panel but the card is in the tree. */
  const isGrowing = (index: number) =>
    entering !== null &&
    !entering.revealed &&
    entering.contents.includes(index);
  /** Opening, column settled — the contents are in and fading up. */
  const isRevealing = (index: number) =>
    (entering?.revealed && entering.contents.includes(index)) ?? false;
  /** The contents are on their way out — replaced by another tool, or going entirely. */
  const isLeaving = (index: number) =>
    pending?.changed.includes(index) ?? false;
  /** The panel itself is going, not just what is in it. */
  const isPanelLeaving = (index: number) =>
    isLeaving(index) && pending?.next[index] === null;
  /** The panel itself is arriving, rather than a new tool arriving inside an existing one. */
  const isPanelArriving = (index: number) =>
    (entering?.revealed && entering.panels.includes(index)) ?? false;

  /**
   * Wraps one tool in its grid cell.
   *
   * Every tool is a direct child of the same grid and only ever changes which *column* it sits
   * in. That matters: moving a tool between panels by re-parenting it would unmount and remount
   * it, throwing away the palette you were part-way through building. Changing a grid-column
   * leaves the element exactly where React thinks it is.
   */
  function slot(id: ToolId, node: ReactNode, scrolls = true) {
    const index = slots.indexOf(id);
    const isOpen = index !== -1;
    return (
      <div
        key={id}
        style={{
          gridColumn: (isOpen ? index : 0) + 1,
          gridRow: 2,
          ...dragStyle(index),
        }}
        // Transparent: the card it sits on is a separate grid child underneath. Only the
        // matching bottom corners are needed here, so scrolled content is clipped by the same
        // curve the card draws rather than painting over it.
        className={
          isOpen && !isGrowing(index)
            ? `${scrolls ? "overflow-y-auto" : "flex flex-col"} min-h-0 ${
                isCarded ? "rounded-b-xl" : ""
              } ${isRevealing(index) ? "animate-panel-content-in" : ""} ${
                isLeaving(index) ? "animate-panel-out" : ""
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
        <span className="flex h-6 w-6 shrink-0 items-center justify-center clay rounded-md bg-brand-600 text-xs font-bold text-white">
          E
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-none">
          <h1 className="truncate text-sm font-semibold">Echo UI Kit</h1>
          <span className="truncate text-[11px] text-zinc-500">
            Front-end dev toolkit
          </span>
        </div>
        <ThemeMenu
          theme={theme}
          onThemeChange={setTheme}
          paletteColors={workingColors}
          isPaletteApplied={isAppThemed}
          onPaletteAppliedChange={setIsAppThemed}
        />
      </header>

      <PanelColumnsProvider value={panelColumns}>
        <div
          ref={gridRef}
          className={`grid min-h-0 flex-1 ${
            isCarded ? "bg-zinc-100 dark:bg-black/25" : ""
          }`}
          style={{
            // Every track in pixels, empty slots at a fixed rail and the open tools dividing
            // what's left. Uniform units because a track list only interpolates against another
            // of the same kind, and a row that can't interpolate can't be transitioned.
            // Fractions until the shell has been measured: on the very first render the
            // observed width is still zero, and a row of 0px tracks would paint an empty frame
            // before the first measurement landed.
            gridTemplateColumns:
              shellWidth > 0
                ? slotWidths.map((width) => `${width}px`).join(" ")
                : slots.map(() => "minmax(0, 1fr)").join(" "),
            // The header row sizes to its content, the tool row takes the rest. minmax(0, 1fr)
            // rather than 1fr so a tool's own scroll container can shrink instead of stretching
            // the row to fit everything inside it.
            gridTemplateRows: "auto minmax(0, 1fr)",
            gap: isCarded ? CARD_GAP : 0,
            padding: isCarded ? CARD_PADDING : 0,
            transition: isResizing
              ? undefined
              : `grid-template-columns ${LAYOUT_TRANSITION_MS}ms cubic-bezier(0.2, 0, 0, 1)`,
          }}
        >
          {/* One card per open tool, spanning its header and its body. Drawn as a single
              element beneath both rather than as a border on each, because a shadow split
              across two stacked boxes casts onto its own other half. Rendered first so it
              paints underneath, and inert so it never intercepts anything. */}
          {isCarded &&
            slots.map((slotTool, index) =>
              slotTool === null ? null : (
                <div
                  key={`card-${slotTool}`}
                  style={{
                    gridColumn: index + 1,
                    gridRow: "1 / -1",
                    ...dragStyle(index),
                  }}
                  className={`pointer-events-none rounded-xl border border-black/10 clay bg-white dark:border-white/10 dark:bg-surface ${
                    isGrowing(index) || isPanelArriving(index)
                      ? "animate-panel-card-in"
                      : ""
                  } ${isPanelLeaving(index) ? "animate-panel-out" : ""}`}
                />
              ),
            )}

          {slots.map((slotTool, index) =>
            slotTool === null ? (
              <AddPanelSlot
                // biome-ignore lint/suspicious/noArrayIndexKey: a slot is a position, not an entity
                key={`add-${index}`}
                column={index + 1}
                style={dragStyle(index)}
                isEntering={index === enteringRail}
                onClick={() => addPanel(index)}
              />
            ) : (
              <div
                key={`header-${slotTool}`}
                style={{
                  gridColumn: index + 1,
                  gridRow: 1,
                  ...dragStyle(index),
                }}
                // The header doubles as the panel's handle. touch-none so a drag on a
                // touchscreen moves the panel instead of scrolling the page out from under it.
                onPointerDown={(event) => startPanelDrag(index, event)}
                onPointerMove={movePanelDrag}
                onPointerUp={endPanelDrag}
                onPointerCancel={endPanelDrag}
                className={
                  isGrowing(index)
                    ? "hidden"
                    : `flex touch-none select-none items-center gap-2 border-black/10 border-b px-3 py-2 dark:border-white/10 ${
                        slots.length > 1
                          ? drag?.from === index
                            ? "cursor-grabbing"
                            : "cursor-grab"
                          : ""
                      } ${
                        isPanelArriving(index) ? "animate-panel-content-in" : ""
                      } ${isPanelLeaving(index) ? "animate-panel-out" : ""}`
                }
              >
                {/* Says the header is a handle, in the corner of the card where a handle is
                    looked for. Everything in this row drags except the switcher and the close
                    button, but nothing said so until this was here. */}
                {slots.length > 1 && (
                  <svg
                    viewBox="0 0 10 16"
                    className="-ml-1 h-4 w-2.5 shrink-0 fill-current text-zinc-300 dark:text-zinc-600"
                    aria-hidden="true"
                  >
                    <circle cx="2" cy="3" r="1.4" />
                    <circle cx="8" cy="3" r="1.4" />
                    <circle cx="2" cy="8" r="1.4" />
                    <circle cx="8" cy="8" r="1.4" />
                    <circle cx="2" cy="13" r="1.4" />
                    <circle cx="8" cy="13" r="1.4" />
                  </svg>
                )}
                <ToolSwitcher
                  tools={tools}
                  // The tool being switched to, before the switch has been applied. The label is
                  // the confirmation that the click landed, and holding it back for the length
                  // of the fade makes the menu feel like it missed.
                  activeId={
                    (isLeaving(index) ? pending?.next[index] : null) ?? slotTool
                  }
                  onChange={(id) => openInPanel(index, id as ToolId)}
                />
                {openCount > 1 && (
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
            ),
          )}

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
                isActive={slots.includes("page")}
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
