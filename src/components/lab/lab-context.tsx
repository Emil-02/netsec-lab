"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { LabState, LabStore } from "@/store/lab-store";

export const LabStoreContext = createContext<LabStore | null>(null);

export function useLabStore(): LabStore {
  const store = useContext(LabStoreContext);
  if (!store) throw new Error("useLabStore must be used inside <LabStoreContext>");
  return store;
}

export function useLab<T>(selector: (s: LabState) => T): T {
  return useStore(useLabStore(), selector);
}
