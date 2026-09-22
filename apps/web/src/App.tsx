import { AppShell, StorageProvider } from "@echo-ui-kit/ui";
import { localStorageAdapter } from "./localStorageAdapter";

/**
 * The web build's half of the app: one adapter, then the same shell the extension mounts.
 *
 * Notably there's no PageInspectorProvider. A hosted page can't reach into another origin's DOM,
 * so the page-dependent tools genuinely don't exist here — and rather than shipping them broken,
 * the shell drops them from the switcher when no inspector is supplied. That asymmetry is the
 * entire reason the adapter boundary exists.
 */
export default function App() {
  return (
    <StorageProvider adapter={localStorageAdapter}>
      {/* Full width: the shell decides how many panels fit from its own measured box, and each
          panel caps its own content — so an outer cap here would only ever remove a panel. */}
      <div className="h-screen w-full">
        <AppShell />
      </div>
    </StorageProvider>
  );
}
