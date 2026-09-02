import { create } from "zustand";

import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_STORAGE_KEY,
  normalizeShortcutCombo,
  type ShortcutActionId,
} from "@/lib/shortcutKeys";

interface ShortcutState {
  shortcuts: Record<ShortcutActionId, string>;
  setShortcut: (id: ShortcutActionId, combo: string) => void;
  resetShortcut: (id: ShortcutActionId) => void;
  resetAllShortcuts: () => void;
}

function readStoredShortcuts() {
  if (typeof window === "undefined") return DEFAULT_SHORTCUTS;
  try {
    const raw = window.localStorage.getItem(SHORTCUT_STORAGE_KEY);
    if (!raw) return DEFAULT_SHORTCUTS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_SHORTCUTS;
    }
    return {
      ...DEFAULT_SHORTCUTS,
      ...Object.fromEntries(
        Object.entries(parsed)
          .map(([key, value]) => [key, normalizeShortcutCombo(String(value))])
          .filter(([, value]) => !!value)
      ),
    } as Record<ShortcutActionId, string>;
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

function writeStoredShortcuts(shortcuts: Record<ShortcutActionId, string>) {
  try {
    window.localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts));
  } catch {
    // Keep in-memory shortcuts when localStorage is unavailable.
  }
}

export const useShortcutStore = create<ShortcutState>((set) => ({
  shortcuts: readStoredShortcuts(),
  setShortcut: (id, combo) =>
    set((state) => {
      const shortcuts = { ...state.shortcuts, [id]: normalizeShortcutCombo(combo) };
      writeStoredShortcuts(shortcuts);
      return { shortcuts };
    }),
  resetShortcut: (id) =>
    set((state) => {
      const shortcuts = { ...state.shortcuts, [id]: DEFAULT_SHORTCUTS[id] };
      writeStoredShortcuts(shortcuts);
      return { shortcuts };
    }),
  resetAllShortcuts: () =>
    set(() => {
      writeStoredShortcuts(DEFAULT_SHORTCUTS);
      return { shortcuts: DEFAULT_SHORTCUTS };
    }),
}));
