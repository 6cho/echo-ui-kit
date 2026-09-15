import {
  ContrastView,
  ExportView,
  PaletteGenerator,
  type SavedColor,
  type SavedPalette,
  SavedPalettesView,
  ShadowGenerator,
  StorageProvider,
  type ToolOption,
  ToolSwitcher,
  useStorage,
  type WorkingPalette,
} from "@echo-ui-kit/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { chromeStorageAdapter } from "../../lib/chromeStorageAdapter";

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

type ToolId = "palette" | "contrast" | "shadow" | "export" | "saved";

function paletteKey(colors: string[]): string {
  return colors.join(",");
}

export default function App() {
  return (
    <StorageProvider adapter={chromeStorageAdapter}>
      <AppShell />
    </StorageProvider>
  );
}

// Split out from App so this can call useStorage() — a component can't consume a context it's
// rendering the Provider for in the same render.
function AppShell() {
  const storage = useStorage();
  const [tool, setTool] = useState<ToolId>("palette");
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

  // Every color the library knows about, flattened and deduped — the shadow tool offers these as
  // preview surfaces so the backdrop can stand in for a real screen instead of a generic gray.
  const libraryColors = useMemo(
    () => [
      ...new Set([
        ...savedColors.map((c) => c.hex.toLowerCase()),
        ...savedPalettes.flatMap((p) =>
          p.colors.map((hex) => hex.toLowerCase()),
        ),
      ]),
    ],
    [savedColors, savedPalettes],
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

  // "Edit" is "select" plus taking you to where editing actually happens. Both make the palette
  // active for the contrast and export tools; only this one moves you off this view.
  function handleEditPalette(palette: SavedPalette) {
    setPaletteToLoad(palette);
    setTool("palette");
  }

  const savedCount = savedPalettes.length + savedColors.length;

  // Descriptions carry live counts so the menu doubles as a status readout — otherwise there's
  // no way to tell how big the palette or the library is without switching to each tool.
  const tools = useMemo<ToolOption[]>(
    () => [
      {
        id: "palette",
        label: "Palette",
        description: "Build a palette from a color or an image",
      },
      {
        id: "contrast",
        label: "Contrast",
        description: "Check pairs, or text over a screenshot",
      },
      {
        id: "shadow",
        label: "Shadow",
        description: "Drag to build a layered box-shadow",
      },
      {
        id: "export",
        label: "Export",
        description: "Copy as CSS, Tailwind, SCSS, or JSON",
      },
      {
        id: "saved",
        label: "Saved",
        description:
          savedCount > 0
            ? `${savedCount} saved color${savedCount === 1 ? "" : "s"} and palettes`
            : "Your saved colors and palettes",
      },
    ],
    [savedCount],
  );

  return (
    <div className="flex h-screen flex-col bg-white text-zinc-900 dark:bg-surface dark:text-zinc-50">
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
        <ToolSwitcher
          tools={tools}
          activeId={tool}
          onChange={(id) => setTool(id as ToolId)}
        />
      </header>

      {/* Every tool stays mounted and is only hidden — a conditional render would unmount
          whichever isn't active, wiping its state (the whole palette being built, included)
          every time you switch away and back. min-h-0 lets each flex-1 region actually shrink
          and scroll internally instead of growing to fit its content (the default flex
          min-height:auto would otherwise block that). PaletteGenerator manages its own internal
          scroll region + fixed footer, so its wrapper stays a bare flex container; the others
          have no footer, so their wrappers scroll directly. */}
      <div
        className={
          tool === "palette" ? "flex min-h-0 flex-1 flex-col" : "hidden"
        }
      >
        <PaletteGenerator
          onSave={handleSavePalette}
          onSaveColor={handleSaveColor}
          onWorkingPaletteChange={handleWorkingPaletteChange}
          onColorFocused={handleColorFocused}
          paletteToLoad={paletteToLoad}
          onPaletteLoaded={handlePaletteLoaded}
        />
      </div>
      <div
        className={
          tool === "contrast" ? "min-h-0 flex-1 overflow-y-auto" : "hidden"
        }
      >
        <ContrastView colors={workingColors} />
      </div>
      <div
        className={
          tool === "shadow" ? "min-h-0 flex-1 overflow-y-auto" : "hidden"
        }
      >
        <ShadowGenerator
          paletteColors={workingColors}
          libraryColors={libraryColors}
        />
      </div>
      <div
        className={
          tool === "export" ? "min-h-0 flex-1 overflow-y-auto" : "hidden"
        }
      >
        <ExportView colors={workingColors} baseColors={workingBaseColors} />
      </div>
      <div
        className={
          tool === "saved" ? "min-h-0 flex-1 overflow-y-auto" : "hidden"
        }
      >
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
        />
      </div>
    </div>
  );
}
