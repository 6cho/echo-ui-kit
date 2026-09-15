import type { StorageAdapter } from "@echo-ui-kit/adapters";

export const chromeStorageAdapter: StorageAdapter = {
  async get<T>(key: string) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  },
  async list(prefix) {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all).filter((k) => k.startsWith(prefix));
  },
};
