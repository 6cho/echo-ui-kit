import {
  AppShell,
  PageInspectorProvider,
  StorageProvider,
} from "@echo-ui-kit/ui";
import { chromePageInspector } from "../../lib/chromePageInspector";
import { chromeStorageAdapter } from "../../lib/chromeStorageAdapter";

/**
 * The extension's half of the app: supply the two adapters this host can provide, then hand over
 * to the shared shell. Everything the panel actually does lives in the UI package, so a second
 * host is a different pair of adapters rather than a second copy of the product.
 */
export default function App() {
  return (
    <StorageProvider adapter={chromeStorageAdapter}>
      <PageInspectorProvider inspector={chromePageInspector}>
        <AppShell />
      </PageInspectorProvider>
    </StorageProvider>
  );
}
