import type { PageInspector } from "@echo-ui-kit/adapters";
import { createContext, type ReactNode, useContext } from "react";

const PageContext = createContext<PageInspector | null>(null);

export function PageInspectorProvider({
  inspector,
  children,
}: {
  inspector: PageInspector;
  children: ReactNode;
}) {
  return (
    <PageContext.Provider value={inspector}>{children}</PageContext.Provider>
  );
}

/**
 * Null rather than throwing when there's no provider, unlike useStorage.
 *
 * Every host can store something, so a missing storage adapter is a wiring mistake. Not every
 * host has a page to inspect — a web build genuinely has none — so absence here is a real state
 * the UI should render, not an error.
 */
export function usePageInspector(): PageInspector | null {
  return useContext(PageContext);
}
