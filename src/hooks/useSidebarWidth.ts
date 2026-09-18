import { useCallback, useState } from "react";

const STORAGE_KEY = "skills-manage.sidebar.expandedWidth";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 240;
const MAX_WIDTH = 420;

function clampWidth(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

function readStoredWidth() {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_WIDTH;
  return clampWidth(Number(raw));
}

export function useSidebarWidth() {
  const [width, setWidthState] = useState(readStoredWidth);

  const setWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidthState(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // Keep the in-memory width if localStorage is unavailable.
    }
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
  }, [setWidth]);

  return {
    width,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    defaultWidth: DEFAULT_WIDTH,
    setWidth,
    resetWidth,
  };
}
