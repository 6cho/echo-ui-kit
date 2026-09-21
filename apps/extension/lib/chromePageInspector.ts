import type { PageInspector } from "@echo-ui-kit/adapters";
import type { PageRequest, PageResponse } from "./pageProtocol";

// Pages the browser refuses to let any extension touch. Recognising them up front turns an
// opaque "could not establish connection" into a sentence that explains itself.
const RESTRICTED_SCHEMES = [
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "devtools:",
];
const RESTRICTED_HOSTS = ["chromewebstore.google.com", "chrome.google.com"];

function describeRestriction(url: string | undefined): string | null {
  if (!url) return "No active tab to inspect";
  try {
    const parsed = new URL(url);
    if (RESTRICTED_SCHEMES.some((scheme) => parsed.protocol === scheme)) {
      return "Browser pages can't be inspected — open a normal site and try again";
    }
    if (RESTRICTED_HOSTS.includes(parsed.hostname)) {
      return "The extension gallery blocks inspection — try another site";
    }
  } catch {
    return "That tab has no inspectable address";
  }
  return null;
}

async function send(request: PageRequest): Promise<PageResponse> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  const restriction = describeRestriction(tab?.url);
  if (restriction) throw new Error(restriction);
  if (tab?.id === undefined) throw new Error("No active tab to inspect");

  let response: PageResponse | undefined;
  try {
    response = await chrome.tabs.sendMessage(tab.id, request);
  } catch {
    // The content script is declared for every page but only attaches on load, so a tab that was
    // already open when the extension installed or reloaded has none. Saying so is more useful
    // than the raw messaging error, which reads like a bug in the extension.
    throw new Error("Reload the page to connect the inspector");
  }

  if (!response) throw new Error("The page didn't respond");
  if (!response.ok) throw new Error(response.error);
  return response;
}

export const chromePageInspector: PageInspector = {
  async summarize() {
    const response = await send({ type: "summarize" });
    if (response.ok && response.type === "summarize") return response.summary;
    throw new Error("Unexpected response");
  },
  async extractColors() {
    const response = await send({ type: "extractColors" });
    if (response.ok && response.type === "extractColors")
      return response.colors;
    throw new Error("Unexpected response");
  },
  async extractFonts() {
    const response = await send({ type: "extractFonts" });
    if (response.ok && response.type === "extractFonts") return response.fonts;
    throw new Error("Unexpected response");
  },
  async setOverlay(mode) {
    await send({ type: "setOverlay", mode });
  },
};
