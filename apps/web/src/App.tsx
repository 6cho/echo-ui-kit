import { AppShell, StorageProvider } from "@echo-ui-kit/ui";
import { localStorageAdapter } from "./localStorageAdapter";

/**
 * The web build's half of the app: one adapter, then the same shell the extension mounts.
 *
 * Notably there's no PageInspectorProvider. A hosted page can't reach into another origin's DOM,
 * so the page-dependent tools genuinely don't exist here — and rather than shipping them broken,
 * the shell drops them from the switcher when no inspector is supplied. That asymmetry is the
 * entire reason the adapter boundary exists.
 *
 * The width cap is deliberately generous rather than phone-width: the shell decides how many
 * panels fit from its own measured width, so constraining it here would be constraining the
 * layout. Three panels plus their borders is the most it will ever use.
 */
export default function App() {
  return (
    <StorageProvider adapter={localStorageAdapter}>
      <div className="flex min-h-screen justify-center bg-zinc-100 dark:bg-zinc-950">
        <div className="flex h-screen w-full max-w-[1280px] flex-col border-black/10 border-x dark:border-white/10">
          <AppShell />
        </div>
      </div>
    </StorageProvider>
  );
}
