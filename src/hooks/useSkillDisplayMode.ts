import { useCallback, useState } from "react";

export type SkillDisplayMode = "list" | "card";

const STORAGE_KEY = "skills-manage.skillDisplayMode";
const DEFAULT_MODE: SkillDisplayMode = "card";

function isSkillDisplayMode(value: string | null): value is SkillDisplayMode {
  return value === "list" || value === "card";
}

function readMode(): SkillDisplayMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return isSkillDisplayMode(raw) ? raw : DEFAULT_MODE;
}

export function useSkillDisplayMode(): [SkillDisplayMode, (mode: SkillDisplayMode) => void] {
  const [mode, setModeState] = useState(readMode);

  const setMode = useCallback((next: SkillDisplayMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep in-memory preference if localStorage is unavailable.
    }
  }, []);

  return [mode, setMode];
}
