import { useCallback, useEffect, useState } from "react";

export type SkillDisplayMode = "list" | "card";

const STORAGE_KEY = "skills-manage.skillDisplayMode";
const DEFAULT_MODE: SkillDisplayMode = "card";
const CHANGE_EVENT = "skills-manage:skill-display-mode";

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
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  }, []);

  useEffect(() => {
    function handleChange(event: Event) {
      const next = event instanceof CustomEvent ? event.detail : readMode();
      if (isSkillDisplayMode(next)) {
        setModeState(next);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        const next = isSkillDisplayMode(event.newValue) ? event.newValue : DEFAULT_MODE;
        setModeState(next);
      }
    }

    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return [mode, setMode];
}
