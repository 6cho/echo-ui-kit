import type { HarmonyType } from "@echo-ui-kit/tools-core";

export interface SavedPalette {
  id: string;
  baseColor: string;
  /** "image" for a palette built from PaletteGenerator's image-extraction mode — not a real
   *  HarmonyType since there's no hue-rotation formula behind it, just whatever colors an image
   *  actually contained. SavedPalettesView's label rendering already works on a plain string, so
   *  this needed no changes there. */
  harmony: HarmonyType | "image";
  colors: string[];
  createdAt: string;
}

/** A single color saved on its own, independent of any palette — e.g. from clicking a swatch
 *  and hitting "Save color" in PaletteGenerator's selected-color footer. */
export interface SavedColor {
  id: string;
  hex: string;
  createdAt: string;
}

/** The palette currently being edited. Everything a SavedPalette holds, plus the scheme's own
 *  columns — those aren't worth persisting (a harmony regenerates them from baseColor) but the
 *  export tool needs them to emit a full tint/shade ramp per color, and an image-derived set
 *  can't be regenerated from anything at all. */
export interface WorkingPalette extends Omit<SavedPalette, "id" | "createdAt"> {
  columns: string[];
}
