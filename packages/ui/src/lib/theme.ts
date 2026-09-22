import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "echo-ui-kit:theme";

/**
 * Read straight from localStorage rather than through the StorageAdapter, which is the one place
 * in the app that does.
 *
 * The adapter is async because chrome.storage is, and a theme has to be known *before the first
 * paint* or the wrong one flashes on screen. localStorage is synchronous and exists in every host
 * this runs in — an extension side panel is an ordinary document with its own origin. It's also
 * the right scope: a rendering preference for this surface, not user data worth syncing.
 */
function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    // Blocked storage (private mode, site-data restrictions) just means no saved preference.
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/**
 * Applies the saved theme immediately, before React renders.
 *
 * Called from each host's entry point rather than from a component: an effect runs after the
 * first paint, so a dark-mode user would see a white panel flash before it corrected itself.
 */
export function initTheme(): void {
  apply(resolveTheme());
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(resolveTheme);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not being able to remember the choice is survivable — it still applies for this session.
    }
  }, [theme]);

  return {
    theme,
    setTheme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
