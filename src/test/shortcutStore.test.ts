import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
import { useShortcutStore } from "@/stores/shortcutStore";
import { DEFAULT_SHORTCUTS } from "@/lib/shortcutKeys";

describe("file-backed shortcuts", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset().mockResolvedValue(null);
    useShortcutStore.setState({ shortcuts: { ...DEFAULT_SHORTCUTS } });
  });
  it("loads saved shortcuts and ignores unknown actions", async () => {
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({ globalSearch: "ctrl+j", unknown: "alt+x" }));
    await useShortcutStore.getState().init();
    expect(useShortcutStore.getState().shortcuts.globalSearch).toBe("ctrl+j");
    expect(useShortcutStore.getState().shortcuts).not.toHaveProperty("unknown");
  });
  it("writes defaults to config on first launch", async () => {
    await useShortcutStore.getState().init();
    expect(invoke).toHaveBeenCalledWith("set_setting", { key: "shortcuts", value: JSON.stringify(DEFAULT_SHORTCUTS) });
  });
  it("upgrades the old view default to F3, adds F5, and preserves custom bindings", async () => {
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({toggleSkillViewMode:"mod+shift+v",globalSearch:"ctrl+j"}));
    await useShortcutStore.getState().init();
    expect(useShortcutStore.getState().shortcuts).toMatchObject({toggleSkillViewMode:"f3",refreshSkillList:"f5",globalSearch:"ctrl+j"});
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({toggleSkillViewMode:"alt+v",refreshSkillList:"alt+r"}));
    await useShortcutStore.getState().init();
    expect(useShortcutStore.getState().shortcuts).toMatchObject({toggleSkillViewMode:"alt+v",refreshSkillList:"alt+r"});
  });
  it("persists edits and resets through configuration IPC", async () => {
    useShortcutStore.getState().setShortcut("globalSearch", "ctrl+j");
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("set_setting", {
      key: "shortcuts", value: JSON.stringify({ ...DEFAULT_SHORTCUTS, globalSearch: "ctrl+j" }),
    }));
    useShortcutStore.getState().resetAllShortcuts();
    await vi.waitFor(() => expect(invoke).toHaveBeenLastCalledWith("set_setting", { key: "shortcuts", value: JSON.stringify(DEFAULT_SHORTCUTS) }));
  });
});
