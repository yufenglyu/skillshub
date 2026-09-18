import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import i18n from "@/i18n";
import { DEFAULT_SHORTCUTS, normalizeShortcutCombo, type ShortcutActionId } from "@/lib/shortcutKeys";

interface ShortcutState {
  shortcuts: Record<ShortcutActionId, string>;
  init: () => Promise<void>;
  setShortcut: (id: ShortcutActionId, combo: string) => void;
  resetShortcut: (id: ShortcutActionId) => void;
  resetAllShortcuts: () => void;
}

let saveQueue = Promise.resolve();
function save(shortcuts: Record<ShortcutActionId, string>) {
  const value = JSON.stringify(shortcuts);
  saveQueue = saveQueue.then(async () => {
    await invoke("set_setting", { key: "shortcuts", value });
  }).catch(() => { toast.error(i18n.t("settings.configSaveFailed")); });
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },
  init: async () => {
    const raw = await invoke<string | null>("get_setting", { key: "shortcuts" });
    const shortcuts = { ...DEFAULT_SHORTCUTS };
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const id of Object.keys(DEFAULT_SHORTCUTS) as ShortcutActionId[]) {
          if (typeof parsed[id] === "string") {
            const combo = normalizeShortcutCombo(parsed[id]);
            if (combo) shortcuts[id] = combo;
          }
        }
      }
    } else {
      await invoke("set_setting", { key: "shortcuts", value: JSON.stringify(shortcuts) });
    }
    set({ shortcuts });
  },
  setShortcut: (id, combo) => {
    const shortcuts = { ...get().shortcuts, [id]: normalizeShortcutCombo(combo) };
    set({ shortcuts });
    save(shortcuts);
  },
  resetShortcut: (id) => get().setShortcut(id, DEFAULT_SHORTCUTS[id]),
  resetAllShortcuts: () => {
    const shortcuts = { ...DEFAULT_SHORTCUTS };
    set({ shortcuts });
    save(shortcuts);
  },
}));
