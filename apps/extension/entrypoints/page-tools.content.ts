import type {
  OverlayOptions,
  PageColor,
  PageFont,
  PageSummary,
} from "@echo-ui-kit/adapters";
import {
  OUTLINE_STYLE_ID,
  OVERLAY_ROOT_ID,
  type PageRequest,
  type PageResponse,
} from "../lib/pageProtocol";

// Walking every element and asking for computed styles is the expensive part — getComputedStyle
// forces layout to be up to date, so it's linear in elements and not cheap per element. A cap
// keeps a pathological page (an infinite-scroll feed with 80k nodes) from locking the tab; the
// first several thousand elements are more than enough to characterise a design anyway.
const MAX_ELEMENTS = 6000;

// Below this many uses a color is almost always incidental — a single bordered widget, a stray
// icon fill — and including it buries the handful of colors the page is actually built from.
const MIN_COLOR_USAGE = 2;
const MAX_COLORS = 24;
const MAX_FONTS = 12;

// DevTools' own box-model colors, because anyone reaching for this tool has seen them before and
// already knows which band means what.
const MARGIN_COLOR = "rgba(246, 178, 107, 0.55)";
const BORDER_COLOR = "rgba(253, 216, 137, 0.60)";
const PADDING_COLOR = "rgba(147, 196, 125, 0.55)";
const CONTENT_COLOR = "rgba(111, 168, 220, 0.55)";

function isOurs(element: Element): boolean {
  return Boolean(element.closest?.(`#${OVERLAY_ROOT_ID}`));
}

function inspectableElements(): Element[] {
  const all = document.body?.querySelectorAll("*") ?? [];
  const result: Element[] = [];
  for (const element of all) {
    if (result.length >= MAX_ELEMENTS) break;
    if (isOurs(element)) continue;
    result.push(element);
  }
  return result;
}

/**
 * `rgb(r, g, b)` / `rgba(r, g, b, a)` to hex.
 *
 * Parsed by hand rather than with a color library on purpose: this file is injected into every
 * page the user visits, so its bundle is a cost paid on every page load. Computed styles are
 * always serialised in this one form, so the general-purpose parser would never earn its weight.
 *
 * Returns null for anything fully transparent — `rgba(0, 0, 0, 0)` is the computed value of "no
 * background", and counting it would make black the most-used color on nearly every page.
 */
function toHex(value: string): string | null {
  const match = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/,
  );
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (alpha === 0) return null;
  const channels = [match[1], match[2], match[3]].map((c) =>
    Math.max(0, Math.min(255, Math.round(Number(c)))),
  );
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function extractColors(): PageColor[] {
  const tally = new Map<string, { usage: number; sources: Set<string> }>();

  function record(hex: string | null, source: string) {
    if (!hex) return;
    const entry = tally.get(hex) ?? { usage: 0, sources: new Set<string>() };
    entry.usage += 1;
    entry.sources.add(source);
    tally.set(hex, entry);
  }

  for (const element of inspectableElements()) {
    const style = getComputedStyle(element);
    // Only counts text color where there's actually text to color. Every element inherits a
    // color whether or not it renders any, so counting them all would rank the body's default
    // text color far above anything the design chose deliberately.
    if (element.textContent?.trim()) record(toHex(style.color), "text");
    record(toHex(style.backgroundColor), "background");
    if (style.borderTopWidth !== "0px") {
      record(toHex(style.borderTopColor), "border");
    }
  }

  return [...tally.entries()]
    .filter(([, entry]) => entry.usage >= MIN_COLOR_USAGE)
    .map(([hex, entry]) => ({
      hex,
      usage: entry.usage,
      sources: [...entry.sources],
    }))
    .sort((a, b) => b.usage - a.usage)
    .slice(0, MAX_COLORS);
}

function extractFonts(): PageFont[] {
  const tally = new Map<
    string,
    { usage: number; sizes: Set<number>; weights: Set<number> }
  >();

  for (const element of inspectableElements()) {
    if (!element.textContent?.trim()) continue;
    const style = getComputedStyle(element);
    // The first family in the stack is the one that actually rendered, assuming it loaded; the
    // rest are fallbacks the page hopes never to reach.
    const family = style.fontFamily.split(",")[0]?.trim().replace(/["']/g, "");
    if (!family) continue;
    const entry = tally.get(family) ?? {
      usage: 0,
      sizes: new Set<number>(),
      weights: new Set<number>(),
    };
    entry.usage += 1;
    entry.sizes.add(Math.round(Number.parseFloat(style.fontSize)));
    entry.weights.add(Number.parseInt(style.fontWeight, 10) || 400);
    tally.set(family, entry);
  }

  return [...tally.entries()]
    .map(([family, entry]) => ({
      family,
      usage: entry.usage,
      sizes: [...entry.sizes].sort((a, b) => b - a),
      weights: [...entry.weights].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.usage - a.usage)
    .slice(0, MAX_FONTS);
}

let overlayRoot: HTMLElement | null = null;
let hoverHandler: ((e: MouseEvent) => void) | null = null;

function ensureOverlayRoot(): HTMLElement {
  if (overlayRoot?.isConnected) return overlayRoot;
  const root = document.createElement("div");
  root.id = OVERLAY_ROOT_ID;
  // Fixed and pointer-events:none so the overlay never intercepts a click or scrolls out of
  // alignment with what it's measuring. The z-index is the maximum a browser will honour —
  // anything less and a page with its own stacking ambitions paints over the inspector.
  root.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483647",
  ].join(";");
  document.documentElement.appendChild(root);
  overlayRoot = root;
  return root;
}

function band(color: string, rect: DOMRect): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed",
    `left:${rect.left}px`,
    `top:${rect.top}px`,
    `width:${Math.max(0, rect.width)}px`,
    `height:${Math.max(0, rect.height)}px`,
    `background:${color}`,
    "pointer-events:none",
  ].join(";");
  return el;
}

function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

function drawInspector(target: Element) {
  const root = ensureOverlayRoot();
  root.textContent = "";

  const rect = target.getBoundingClientRect();
  const style = getComputedStyle(target);

  const margin = {
    top: px(style.marginTop),
    right: px(style.marginRight),
    bottom: px(style.marginBottom),
    left: px(style.marginLeft),
  };
  const border = {
    top: px(style.borderTopWidth),
    right: px(style.borderRightWidth),
    bottom: px(style.borderBottomWidth),
    left: px(style.borderLeftWidth),
  };
  const padding = {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };

  // Painted outermost first so each inner box covers the one behind it — that's what makes the
  // bands read as separate regions rather than four stacked translucent rectangles.
  root.appendChild(
    band(
      MARGIN_COLOR,
      new DOMRect(
        rect.left - margin.left,
        rect.top - margin.top,
        rect.width + margin.left + margin.right,
        rect.height + margin.top + margin.bottom,
      ),
    ),
  );
  root.appendChild(band(BORDER_COLOR, rect));
  root.appendChild(
    band(
      PADDING_COLOR,
      new DOMRect(
        rect.left + border.left,
        rect.top + border.top,
        rect.width - border.left - border.right,
        rect.height - border.top - border.bottom,
      ),
    ),
  );
  root.appendChild(
    band(
      CONTENT_COLOR,
      new DOMRect(
        rect.left + border.left + padding.left,
        rect.top + border.top + padding.top,
        rect.width - border.left - border.right - padding.left - padding.right,
        rect.height - border.top - border.bottom - padding.top - padding.bottom,
      ),
    ),
  );

  const label = document.createElement("div");
  const classes = typeof target.className === "string" ? target.className : "";
  const firstClass = classes.trim().split(/\s+/).filter(Boolean)[0];
  label.textContent = `${target.tagName.toLowerCase()}${
    firstClass ? `.${firstClass}` : ""
  } · ${Math.round(rect.width)}×${Math.round(rect.height)}`;
  // Flipped below the element when there's no room above, so the label never leaves the viewport
  // on something near the top of the page.
  const above = rect.top - margin.top > 24;
  label.style.cssText = [
    "position:fixed",
    `left:${Math.max(4, rect.left - margin.left)}px`,
    above
      ? `top:${rect.top - margin.top - 22}px`
      : `top:${rect.bottom + margin.bottom + 4}px`,
    "padding:2px 6px",
    "border-radius:4px",
    "background:#18181b",
    "color:#fafafa",
    "font:500 11px/1.4 ui-monospace,SFMono-Regular,monospace",
    "white-space:nowrap",
    "pointer-events:none",
  ].join(";");
  root.appendChild(label);
}

function setOutline(on: boolean) {
  document.getElementById(OUTLINE_STYLE_ID)?.remove();
  if (!on) return;
  const style = document.createElement("style");
  style.id = OUTLINE_STYLE_ID;
  // Outline rather than border: it's drawn outside the box and doesn't participate in layout,
  // so turning this on can't reflow the page it's trying to show you.
  style.textContent = `
    *:not(#${OVERLAY_ROOT_ID}):not(#${OVERLAY_ROOT_ID} *) { outline: 1px solid rgba(111,168,220,0.5) !important; }
    section, article, main, header, footer, nav, aside { outline-color: rgba(147,196,125,0.7) !important; }
    p, h1, h2, h3, h4, h5, h6, span, a, li { outline-color: rgba(246,178,107,0.6) !important; }
    img, svg, video, canvas { outline-color: rgba(224,102,102,0.7) !important; }
  `;
  document.head.appendChild(style);
}

function setInspect(on: boolean) {
  if (hoverHandler) {
    document.removeEventListener("mousemove", hoverHandler, true);
    hoverHandler = null;
  }
  if (!on) {
    overlayRoot?.remove();
    overlayRoot = null;
    return;
  }
  ensureOverlayRoot();
  hoverHandler = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || isOurs(target)) return;
    drawInspector(target);
  };
  // Capture phase, because a page that stops mousemove propagation on its own widgets would
  // otherwise create dead zones the inspector silently can't see into.
  document.addEventListener("mousemove", hoverHandler, true);
}

function setOverlay(options: OverlayOptions) {
  // Applied separately so turning one off leaves the other alone — they're independent effects
  // that happen to share a control.
  setOutline(options.outline);
  setInspect(options.inspect);
}

function summarize(): PageSummary {
  return {
    title: document.title,
    url: location.href,
    elementCount: document.body?.querySelectorAll("*").length ?? 0,
  };
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    chrome.runtime.onMessage.addListener(
      (request: PageRequest, _sender, sendResponse) => {
        try {
          switch (request.type) {
            case "summarize":
              sendResponse({
                ok: true,
                type: "summarize",
                summary: summarize(),
              } satisfies PageResponse);
              break;
            case "extractColors":
              sendResponse({
                ok: true,
                type: "extractColors",
                colors: extractColors(),
              } satisfies PageResponse);
              break;
            case "extractFonts":
              sendResponse({
                ok: true,
                type: "extractFonts",
                fonts: extractFonts(),
              } satisfies PageResponse);
              break;
            case "setOverlay":
              setOverlay(request.options);
              sendResponse({
                ok: true,
                type: "setOverlay",
              } satisfies PageResponse);
              break;
          }
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Page tool failed",
          } satisfies PageResponse);
        }
        // Synchronous responses only, so returning true (which would keep the channel open for an
        // async reply) would just leak a port on every message.
        return false;
      },
    );
  },
});
