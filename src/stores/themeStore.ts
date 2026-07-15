import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const THEME_MODE_STORAGE_KEY = "skillshub-theme-mode";
const LEGACY_FLAVOR_STORAGE_KEY = "catppuccin-flavor";
const LEGACY_ACCENT_STORAGE_KEY = "catppuccin-accent";

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
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
  try {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    localStorage.removeItem(LEGACY_FLAVOR_STORAGE_KEY);
    localStorage.removeItem(LEGACY_ACCENT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  return resolvedTheme;
}

interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
  init: () => void;
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
  },

  cycleMode: () => {
    const mode = nextThemeMode(get().mode);
    const resolvedTheme = applyMode(mode);
    set({ mode, resolvedTheme });
  },

  init: () => {
    const mode = readStoredMode();
    const resolvedTheme = applyMode(mode);
    set({ mode, resolvedTheme });
  },
}));
