import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchInstallResult, SkillWithLinks } from "@/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";

const resourceSkill: SkillWithLinks = {
  id: "resource-skill",
  name: "Resource Skill",
  file_path: "C:/library/resource-skill/SKILL.md",
  canonical_path: "C:/library/resource-skill",
  is_central: false,
  scanned_at: "2026-07-18T00:00:00Z",
  linked_agents: [],
  read_only_agents: [],
};

describe("resourceLibraryStore platform installs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResourceLibraryStore.setState({
      skills: [resourceSkill],
      agents: [],
      resourceLibraryDir: "C:/library",
      isLoading: false,
      isInstalling: false,
      isUpdatingSources: false,
      togglingAgentId: null,
      deletingSkillId: null,
      error: null,
    });
  });

  it("uses the resource-specific batch command", async () => {
    const result: BatchInstallResult = { succeeded: ["codex"], failed: [] };
    vi.mocked(invoke).mockResolvedValueOnce(result).mockResolvedValueOnce([resourceSkill]);

    await useResourceLibraryStore
      .getState()
      .installSkill("resource-skill", ["codex"], "symlink");

    expect(invoke).toHaveBeenNthCalledWith(1, "batch_install_resource_skill_to_agents", {
      skillId: "resource-skill",
      agentIds: ["codex"],
      method: "symlink",
    });
  });

  it("uses the resource-specific command for a platform icon toggle", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ succeeded: ["codex"], failed: [] })
      .mockResolvedValueOnce([{ ...resourceSkill, linked_agents: ["codex"] }]);

    await useResourceLibraryStore.getState().togglePlatformLink("resource-skill", "codex");

    expect(invoke).toHaveBeenNthCalledWith(1, "batch_install_resource_skill_to_agents", {
      skillId: "resource-skill",
      agentIds: ["codex"],
      method: "auto",
    });
  });
});
