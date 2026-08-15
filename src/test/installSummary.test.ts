import { describe, expect, it } from "vitest";

import { buildInstallSummary, formatInstallSummaryTooltip, uniqueAgentIds } from "@/lib/installSummary";
import { mergeProjectAgents } from "@/lib/projectTargets";
import type { AgentWithStatus, ScanDirectory } from "@/types";

const agents: AgentWithStatus[] = [
  {
    id: "claude-code",
    display_name: "Claude Code",
    category: "coding",
    global_skills_dir: "~/.claude/skills",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "project:1",
    display_name: "Demo",
    category: "project",
    global_skills_dir: "~/Projects/Demo/.agents/skills",
    is_detected: true,
    is_builtin: false,
    is_enabled: true,
  },
  {
    id: "hermes",
    display_name: "Hermes",
    category: "coding",
    global_skills_dir: "~/.agents/skills",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
    shares_central_skills: true,
  },
];

describe("buildInstallSummary", () => {
  it("splits direct platforms, projects, and shared targets", () => {
    const summary = buildInstallSummary(
      ["claude-code", "project:1", "hermes"],
      ["hermes"],
      agents
    );

    expect(summary.directPlatforms).toEqual([
      { id: "claude-code", name: "Claude Code" },
    ]);
    expect(summary.directProjects).toEqual([{ id: "project:1", name: "Demo" }]);
    expect(summary.shared).toEqual([{ id: "hermes", name: "Hermes" }]);
  });

  it("formats tooltip details by target kind", () => {
    const summary = buildInstallSummary(
      ["claude-code", "project:1"],
      ["hermes"],
      agents
    );
    const tooltip = formatInstallSummaryTooltip((key, options) => {
      if (key === "skillBrowser.installSummaryTooltipPlatforms") {
        return `平台：${options?.names}`;
      }
      if (key === "skillBrowser.installSummaryTooltipProjects") {
        return `项目：${options?.names}`;
      }
      if (key === "skillBrowser.installSummaryTooltipShared") {
        return `共享：${options?.names}`;
      }
      return key;
    }, summary);

    expect(tooltip).toBe("平台：Claude Code\n项目：Demo\n共享：Hermes");
  });

  it("deduplicates agent ids across lists", () => {
    expect(uniqueAgentIds([["claude-code", "hermes"], ["hermes", "project:1"], null])).toEqual([
      "claude-code",
      "hermes",
      "project:1",
    ]);
  });
});

describe("mergeProjectAgents", () => {
  it("marks project agents whose .agents/skills path shares the central root", () => {
    const softwareAgents: AgentWithStatus[] = [
      {
        id: "central",
        display_name: "Central Skills",
        category: "central",
        global_skills_dir: "C:/Users/alice/.agents/skills",
        is_detected: true,
        is_builtin: true,
        is_enabled: true,
      },
      {
        id: "cursor",
        display_name: "Cursor",
        category: "coding",
        global_skills_dir: "C:/Users/alice/.cursor/skills",
        is_detected: true,
        is_builtin: true,
        is_enabled: true,
      },
    ];
    const directories: ScanDirectory[] = [
      {
        id: 1,
        path: "C:/Users/alice",
        is_active: true,
        is_builtin: false,
        added_at: "2026-08-15T00:00:00Z",
      },
      {
        id: 2,
        path: "C:/Projects/Demo",
        is_active: true,
        is_builtin: false,
        added_at: "2026-08-15T00:00:00Z",
      },
    ];

    const merged = mergeProjectAgents(softwareAgents, directories);
    expect(merged.find((agent) => agent.id === "project:1")?.shares_central_skills).toBe(
      true
    );
    expect(merged.find((agent) => agent.id === "project:2")?.shares_central_skills).toBe(
      false
    );
  });
});
