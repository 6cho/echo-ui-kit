import type {
  OverlayOptions,
  PageColor,
  PageFont,
  PageSummary,
} from "@echo-ui-kit/adapters";

/**
 * The wire format between the side panel and the content script.
 *
 * Lives in the extension rather than in the adapters package because it's a transport detail —
 * adapters describes *what* a page inspector can do, this describes how these two particular
 * halves say it to each other.
 */
export type PageRequest =
  | { type: "summarize" }
  | { type: "extractColors" }
  | { type: "extractFonts" }
  | { type: "setOverlay"; options: OverlayOptions };

export type PageResponse =
  | { ok: true; type: "summarize"; summary: PageSummary }
  | { ok: true; type: "extractColors"; colors: PageColor[] }
  | { ok: true; type: "extractFonts"; fonts: PageFont[] }
  | { ok: true; type: "setOverlay" }
  | { ok: false; error: string };

/** Marks the panel's own injected DOM so the inspector never reports on itself. */
export const OVERLAY_ROOT_ID = "echo-ui-kit-overlay-root";
export const OUTLINE_STYLE_ID = "echo-ui-kit-outline-style";
