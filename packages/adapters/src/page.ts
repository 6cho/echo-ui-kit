/**
 * A color found on the page, with how much of it there is.
 *
 * `usage` is counted per element-property rather than per element, because one element can
 * contribute a text color and a background color that have nothing to do with each other.
 */
export interface PageColor {
  hex: string;
  usage: number;
  /** Which properties it appeared in — "color", "background", "border". */
  sources: string[];
}

export interface PageFont {
  /** The resolved stack as the page declared it, first family only. */
  family: string;
  usage: number;
  /** Distinct rendered sizes, in px, largest first. */
  sizes: number[];
  weights: number[];
}

/**
 * Which overlays are drawn on the page. Independent flags rather than one mode, because they
 * answer different questions and are genuinely useful together: outlines show you the whole
 * page's structure at once, while the inspector explains the single element under your cursor.
 */
export interface OverlayOptions {
  /** Outline every element, color-coded by kind. */
  outline: boolean;
  /** Margin/border/padding/content bands for whatever is hovered. */
  inspect: boolean;
}

export interface PageSummary {
  title: string;
  url: string;
  elementCount: number;
}

/**
 * The tools that act on whatever page the user is looking at, rather than on data inside the
 * panel. Behind an interface for the same reason storage is: the UI package can't reach for
 * `chrome.*` directly without becoming extension-only, and a web build has no page to inspect —
 * it would supply an adapter that reports the feature as unavailable.
 *
 * Every method can reject. Browsers refuse injection on their own internal pages (the new-tab
 * page, the web store, `chrome://` anything), which is a normal thing for a user to be looking
 * at, not an exceptional one — so callers are expected to surface the failure, not treat it as a
 * bug.
 */
export interface PageInspector {
  /** Basic facts about the active tab, used to confirm there's something to inspect at all. */
  summarize(): Promise<PageSummary>;
  extractColors(): Promise<PageColor[]>;
  extractFonts(): Promise<PageFont[]>;
  setOverlay(options: OverlayOptions): Promise<void>;
}
