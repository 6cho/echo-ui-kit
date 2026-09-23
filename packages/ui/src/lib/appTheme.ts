import { deriveAppTheme } from "@echo-ui-kit/tools-core";
import { useEffect, useMemo } from "react";

/**
 * Paints the interface itself with the palette being built in it.
 *
 * Written as custom properties on the document root because that is where Tailwind's own tokens
 * live: `bg-brand-600` compiles to `var(--color-brand-600)`, so overriding the variable
 * re-colours every use of it at once, with no component knowing this happened. It also means the
 * change is live — the palette updates on every slider tick, and so does the app.
 *
 * Note that the accent the app ends up with is not always the palette's own: a pale palette has
 * its accent darkened until white text on a button is readable. Nothing here has to surface that,
 * because the header's own toggle paints with the same variable — whatever the interface is using
 * is what the toggle shows.
 */
export function useAppTheme(colors: string[], enabled: boolean): void {
  // Keyed on the contents rather than the array, which is a fresh object on every render of the
  // generator — i.e. on every drag frame.
  const key = colors.join(",");
  const theme = useMemo(
    () => (enabled && key ? deriveAppTheme(key.split(",")) : null),
    [key, enabled],
  );

  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(theme.variables)) {
      root.style.setProperty(name, value);
    }
    // Removing rather than restoring: these properties have no inline value of their own to go
    // back to, and clearing them hands the interface back to the stylesheet's defaults.
    return () => {
      for (const name of Object.keys(theme.variables)) {
        root.style.removeProperty(name);
      }
    };
  }, [theme]);
}
