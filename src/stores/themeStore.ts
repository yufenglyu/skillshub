import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import i18n from "@/i18n";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function resolveMode(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? systemTheme() : mode;
}

function applyMode(mode: ThemeMode): ResolvedTheme {
  const resolvedTheme = resolveMode(mode);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themeMode = mode;
    delete document.documentElement.dataset.accent;
  }
  return resolvedTheme;
}

interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
  init: () => Promise<void>;
}

function nextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === "system") return "light";
  if (mode === "light") return "dark";
  return "system";
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "system",
  resolvedTheme: "dark",

  setMode: (mode) => {
    const resolvedTheme = applyMode(mode);
    set({ mode, resolvedTheme });
    void invoke("set_setting", { key: "theme_mode", value: mode }).catch(() => {
      toast.error(i18n.t("settings.configSaveFailed"));
    });
  },

  cycleMode: () => get().setMode(nextThemeMode(get().mode)),

  init: async () => {
    const stored = await invoke<string | null>("get_setting", { key: "theme_mode" });
    const mode = isThemeMode(stored) ? stored : "system";
    const resolvedTheme = applyMode(mode);
    set({ mode, resolvedTheme });
  },
}));
