import type { ReactNode } from "react";
import type { SavedColor, SavedPalette } from "../types/palette";
import { type MenuItem, ThreeDotMenu } from "./ThreeDotMenu";
import { ToolColumns } from "./ToolColumns";

function paletteKey(colors: string[]): string {
  return colors.join(",");
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}

function harmonyLabel(type: string): string {
  return type.replace("-", " ");
}

function sortByRecency<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
      {children}
    </span>
  );
}

function PaletteRow({
  palette,
  onSelect,
  onEdit,
  trailingItem,
}: {
  palette: SavedPalette;
  onSelect?: (palette: SavedPalette) => void;
  onEdit?: (palette: SavedPalette) => void;
  /** The last menu entry, which differs by list: saved rows delete, unsaved rows save. */
  trailingItem: MenuItem;
}) {
  return (
    <div className="clay flex items-center gap-3 rounded-lg bg-zinc-100 p-2.5 dark:border-white/10 dark:bg-surface-elevated">
      {/* The base color at a size you can actually judge — it's the one color the whole palette
          was derived from, so it deserves more than an equal share of a row of identical dots. */}
      <div
        title={palette.baseColor}
        className="h-12 w-12 shrink-0 rounded-lg border border-black/10 dark:border-white/10"
        style={{ backgroundColor: palette.baseColor }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Contiguous segments rather than separate circles, matching the palette preview in the
            generator's footer — a palette reads as one object, and at 8+ colors the old wrapped
            row of dots spilled onto a second line and stopped looking like a single swatch set. */}
        <div className="flex h-5 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
          {palette.colors.map((hex, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a palette's own color list is a fixed, non-reorderable snapshot
              key={`${palette.id}-${hex}-${i}`}
              title={hex}
              className="min-w-0 flex-1"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium capitalize text-zinc-700 dark:text-zinc-300">
            {harmonyLabel(palette.harmony)}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-zinc-500">
            {formatRelativeTime(palette.createdAt)}
          </span>
        </div>
      </div>
      <ThreeDotMenu
        items={[
          ...(onSelect
            ? [{ label: "Select", onSelect: () => onSelect(palette) }]
            : []),
          ...(onEdit
            ? [{ label: "Edit", onSelect: () => onEdit(palette) }]
            : []),
          trailingItem,
        ]}
      />
    </div>
  );
}

function ColorChip({
  color,
  actionLabel,
  actionTitle,
  onAction,
}: {
  color: SavedColor;
  actionLabel: string;
  actionTitle: string;
  onAction: (id: string) => void;
}) {
  return (
    <div className="clay flex items-center gap-1.5 rounded-full bg-zinc-100 py-1 pr-1.5 pl-1 dark:border-white/10 dark:bg-surface-elevated">
      <span
        className="h-5 w-5 shrink-0 rounded-full border border-black/10 dark:border-white/10"
        style={{ backgroundColor: color.hex }}
      />
      <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
        {color.hex}
      </span>
      <button
        type="button"
        onClick={() => onAction(color.id)}
        title={actionTitle}
        className="shrink-0 cursor-pointer rounded-full px-1 py-0.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 active:scale-90 dark:hover:bg-surface-hover dark:hover:text-white"
      >
        {actionLabel}
      </button>
    </div>
  );
}

/**
 * The library: what you've explicitly saved, plus the unsaved work that would otherwise be lost.
 *
 * "Recent" here is genuine history — palettes you settled on and colors you clicked but never
 * saved. It deliberately excludes anything already in the saved lists, because an entry that
 * appears in both sections is just the same thing twice, which is what this section used to be
 * before it tracked anything of its own. Acting on a recent entry (saving it) therefore makes it
 * leave Recent and appear under Saved, which is the whole point of the distinction.
 */
export function SavedPalettesView({
  palettes,
  onDeletePalette,
  onSelectPalette,
  onEditPalette,
  onSavePalette,
  colors,
  onDeleteColor,
  onSaveColor,
  recentPalettes,
  onDismissRecentPalette,
  recentColors,
  onDismissRecentColor,
}: {
  palettes: SavedPalette[];
  onDeletePalette: (id: string) => void;
  /** Makes this the working palette without leaving this view — the contrast and export tools
   *  read that, so "select" is how you point them at something you saved earlier. */
  onSelectPalette?: (palette: SavedPalette) => void;
  /** Same, but also hands control back to the palette editor so it can be changed. */
  onEditPalette?: (palette: SavedPalette) => void;
  /** Promotes an unsaved recent palette into the saved list. */
  onSavePalette?: (palette: Omit<SavedPalette, "id" | "createdAt">) => void;
  colors: SavedColor[];
  onDeleteColor: (id: string) => void;
  /** Promotes an unsaved recent color into the saved list. */
  onSaveColor?: (hex: string) => void;
  recentPalettes: SavedPalette[];
  onDismissRecentPalette: (id: string) => void;
  recentColors: SavedColor[];
  onDismissRecentColor: (id: string) => void;
}) {
  const savedPaletteKeys = new Set(palettes.map((p) => paletteKey(p.colors)));
  const savedColorHexes = new Set(colors.map((c) => c.hex.toLowerCase()));

  const unsavedPalettes = sortByRecency(
    recentPalettes.filter((p) => !savedPaletteKeys.has(paletteKey(p.colors))),
  );
  const unsavedColors = sortByRecency(
    recentColors.filter((c) => !savedColorHexes.has(c.hex.toLowerCase())),
  );

  const sortedColors = sortByRecency(colors);
  const sortedPalettes = sortByRecency(palettes);

  const isEmpty =
    palettes.length === 0 &&
    colors.length === 0 &&
    unsavedPalettes.length === 0 &&
    unsavedColors.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Nothing here yet
        </p>
        <p className="max-w-[220px] text-xs text-zinc-500">
          Build a palette in the Palette tool — it'll show up here as recent
          work even before you save it.
        </p>
      </div>
    );
  }

  return (
    <ToolColumns gap="5" className="p-4">
      {unsavedColors.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionHeading>Recent Colors (unsaved)</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {unsavedColors.map((color) => (
              <ColorChip
                key={color.id}
                color={color}
                actionLabel={onSaveColor ? "Save" : "✕"}
                actionTitle={
                  onSaveColor ? "Save this color" : "Remove from recent colors"
                }
                onAction={() => {
                  if (onSaveColor) onSaveColor(color.hex);
                  else onDismissRecentColor(color.id);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {unsavedPalettes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionHeading>Recent Palettes (unsaved)</SectionHeading>
          <div className="flex flex-col gap-2">
            {unsavedPalettes.map((palette) => (
              <PaletteRow
                key={palette.id}
                palette={palette}
                onSelect={onSelectPalette}
                onEdit={onEditPalette}
                trailingItem={
                  onSavePalette
                    ? {
                        label: "Save",
                        onSelect: () => onSavePalette(palette),
                      }
                    : {
                        label: "Dismiss",
                        onSelect: () => onDismissRecentPalette(palette.id),
                        destructive: true,
                      }
                }
              />
            ))}
          </div>
        </div>
      )}

      {sortedColors.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionHeading>{`Saved Colors (${sortedColors.length})`}</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {sortedColors.map((color) => (
              <ColorChip
                key={color.id}
                color={color}
                actionLabel="✕"
                actionTitle="Delete this saved color"
                onAction={onDeleteColor}
              />
            ))}
          </div>
        </div>
      )}

      {sortedPalettes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionHeading>{`Saved Palettes (${sortedPalettes.length})`}</SectionHeading>
          <div className="flex flex-col gap-2">
            {sortedPalettes.map((palette) => (
              <PaletteRow
                key={palette.id}
                palette={palette}
                onSelect={onSelectPalette}
                onEdit={onEditPalette}
                trailingItem={{
                  label: "Delete",
                  onSelect: () => onDeletePalette(palette.id),
                  destructive: true,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </ToolColumns>
  );
}
