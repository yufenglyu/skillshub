import { useEffect } from "react";

import {
  matchesShortcutEvent,
  shouldIgnoreShortcutTarget,
  type ShortcutActionId,
} from "@/lib/shortcutKeys";
import { useShortcutStore } from "@/stores/shortcutStore";

export function useConfiguredHotkey(
  actionId: ShortcutActionId,
  callback: () => void,
  options: { allowInEditable?: boolean; enabled?: boolean } = {}
) {
  const combo = useShortcutStore((state) => state.shortcuts[actionId]);
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled || !combo) return;

    function handler(event: KeyboardEvent) {
      if (!options.allowInEditable && shouldIgnoreShortcutTarget(event.target)) {
        return;
      }
      if (!matchesShortcutEvent(event, combo)) return;
      event.preventDefault();
      callback();
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [callback, combo, enabled, options.allowInEditable]);
}
