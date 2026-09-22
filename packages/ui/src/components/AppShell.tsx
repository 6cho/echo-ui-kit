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

function paletteKey(colors: string[]): string {
  return colors.join(",");
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
      setMaxPanels(
        Math.min(MAX_PANELS, Math.max(1, Math.floor(width / MIN_PANEL_WIDTH))),
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

  function addPanel() {
    setPanels((current) => {
      if (current.length >= maxPanels) return current;
      const unused = tools.find((t) => !current.includes(t.id as ToolId));
      return unused ? [...current, unused.id as ToolId] : current;
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
        style={{ gridColumn: (isOpen ? index : 0) + 1, gridRow: 2 }}
        className={
          isOpen
            ? `${scrolls ? "overflow-y-auto" : "flex flex-col"} min-h-0 ${
                index > 0 ? "border-black/10 border-l dark:border-white/10" : ""
              }`
            : "hidden"
        }
      >
        {/* Capped and centred rather than filling the panel. The tools are laid out as a
            phone-width column of controls; stretched across a desktop the labels end up an
            inch from their inputs and a gradient preview becomes a two-thousand-pixel band.
            The scroll container stays full width so the scrollbar sits at the panel's edge
            rather than floating in the middle of it. */}
        <div
          // Written out rather than built from a constant: Tailwind scans source text, so a class
          // assembled at runtime is a class it never generates.
          className={`mx-auto w-full max-w-[500px] ${
            scrolls ? "" : "flex h-full min-h-0 flex-col"
          }`}
        >
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

        {/* Only offered when there's room for another panel — on a phone or in the extension's
            side panel there never is, which is what makes this a progressive enhancement of the
            single-column layout rather than a mode to opt into. */}
        {panels.length < maxPanels && (
          <button
            type="button"
            onClick={addPanel}
            title="Open another tool beside this one"
            className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-black/10 px-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-surface-elevated"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <title>Split view</title>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M13 4v16" />
            </svg>
            Split
          </button>
        )}
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `repeat(${panels.length}, minmax(0, 1fr))`,
          // The header row sizes to its content, the tool row takes the rest. minmax(0, 1fr)
          // rather than 1fr so a tool's own scroll container can shrink instead of stretching
          // the row to fit everything inside it.
          gridTemplateRows: "auto minmax(0, 1fr)",
        }}
      >
        {panels.map((panelTool, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: a panel is a position, not an entity — index is its identity
            key={`panel-${index}`}
            style={{ gridColumn: index + 1, gridRow: 1 }}
            className={`flex items-center gap-2 border-black/10 border-b px-3 py-2 dark:border-white/10 ${
              index > 0 ? "border-l" : ""
            }`}
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
        {slot("gradient", <GradientGenerator paletteColors={workingColors} />)}
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
          <ExportView colors={workingColors} baseColors={workingBaseColors} />,
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
    </div>
  );
}
