import { createContext, useContext } from "react";

/**
 * How many columns of controls the panel a tool is sitting in has room for.
 *
 * Tools are written as a single phone-width stack of sections, which is the right shape in the
 * extension's side panel and the wrong one on a desktop browser, where that stack leaves most of
 * the window empty. Rather than each tool measuring its own box, the shell measures once and says
 * how many columns fit; a tool only has to decide how to use them.
 *
 * Defaults to 1 so a tool rendered outside the shell — a test, a story — still lays out.
 */
const PanelColumnsContext = createContext(1);

export const PanelColumnsProvider = PanelColumnsContext.Provider;

export function usePanelColumns(): number {
  return useContext(PanelColumnsContext);
}
