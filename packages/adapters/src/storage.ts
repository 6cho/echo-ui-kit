/**
 * Every tool talks to storage through this interface instead of calling
 * localStorage/chrome.storage/fetch directly, so the same UI component works
 * unmodified in the web app and the extension — only the adapter differs.
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** All keys currently stored under `prefix`. */
  list(prefix: string): Promise<string[]>;
}
