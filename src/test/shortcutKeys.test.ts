import { describe, expect, it } from "vitest";

import {
  formatShortcutCombo,
  matchesShortcutEvent,
  normalizeShortcutCombo,
} from "@/lib/shortcutKeys";

function keyEvent(key: string, init: Partial<KeyboardEventInit> = {}) {
  return new KeyboardEvent("keydown", { key, ...init });
}

describe("shortcutKeys", () => {
  it("normalizes shortcut combos into stable modifier order", () => {
    expect(normalizeShortcutCombo(" Shift + Ctrl + v ")).toBe("ctrl+shift+v");
    expect(normalizeShortcutCombo("Cmd+K")).toBe("meta+k");
    expect(normalizeShortcutCombo("Alt+ArrowDown")).toBe("alt+down");
  });

  it("matches configured shortcuts", () => {
    expect(matchesShortcutEvent(keyEvent("V", { ctrlKey: true, shiftKey: true }), "ctrl+shift+v")).toBe(true);
    expect(matchesShortcutEvent(keyEvent("V", { ctrlKey: true }), "ctrl+shift+v")).toBe(false);
  });

  it("formats combos for display", () => {
    expect(formatShortcutCombo("mod+shift+v")).toContain("Shift");
    expect(formatShortcutCombo("alt+1")).toBe("Alt+1");
  });
});
