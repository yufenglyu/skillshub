import { useEffect } from "react";

import { matchesShortcutEvent } from "@/lib/shortcutKeys";

/**
 * Registers a global keyboard shortcut.
 * @param key - The key combo (e.g. "mod+k"). "mod" maps to Meta on Mac, Ctrl elsewhere.
 * @param callback - Function to call when the shortcut fires.
 */
export function useHotkey(key: string, callback: () => void) {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (!matchesShortcutEvent(event, key)) return;
      event.preventDefault();
      callback();
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, callback]);
}
