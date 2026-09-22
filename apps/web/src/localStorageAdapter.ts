import type { StorageAdapter } from "@echo-ui-kit/adapters";

const PREFIX = "echo-ui-kit:";

/**
 * The web build's half of the storage contract.
 *
 * Async despite localStorage being synchronous, because the interface is shaped around
 * chrome.storage, which isn't — and a contract that only fits the simplest backend would have to
 * be rewritten the first time anything needs a network or IndexedDB behind it.
 *
 * Keys are prefixed so the app can list its own without walking over whatever else shares the
 * origin, and so `list` means something more specific than "every key in localStorage".
 */
export const localStorageAdapter: StorageAdapter = {
  async get<T>(key: string) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      // Unreadable (private-mode restrictions) or unparseable (a half-written value from an
      // interrupted save) both mean the same thing to a caller: nothing usable is stored.
      return undefined;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (error) {
      // Quota exhaustion is the realistic failure, and it's worth a console line rather than a
      // thrown error — losing one save shouldn't take the tool down with it.
      console.error("Could not save", key, error);
    }
  },
  async remove(key) {
    localStorage.removeItem(PREFIX + key);
  },
  async list(prefix) {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const stored = localStorage.key(i);
      if (!stored?.startsWith(PREFIX)) continue;
      const key = stored.slice(PREFIX.length);
      if (key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  },
};
