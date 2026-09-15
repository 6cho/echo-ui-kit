import type { StorageAdapter } from "@echo-ui-kit/adapters";
import { createContext, type ReactNode, useContext } from "react";

const StorageContext = createContext<StorageAdapter | null>(null);

export function StorageProvider({
  adapter,
  children,
}: {
  adapter: StorageAdapter;
  children: ReactNode;
}) {
  return (
    <StorageContext.Provider value={adapter}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage(): StorageAdapter {
  const adapter = useContext(StorageContext);
  if (!adapter)
    throw new Error("useStorage must be used within a StorageProvider");
  return adapter;
}
