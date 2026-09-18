import { describe, expect, it } from "vitest";

import { buildInstallSummary, formatInstallSummaryTooltip, uniqueAgentIds, installationSourcesForSkill, buildMembershipInstallSummary, platformSkillsWithSharedHub } from "@/lib/installSummary";
import { mergeProjectAgents } from "@/lib/projectTargets";
import type { AgentWithStatus, ScanDirectory, ScannedSkill, SkillWithLinks } from "@/types";

const agents: AgentWithStatus[] = [
  {
    id: "claude-code",
    display_name: "Claude Code",
    global_skills_dir: "~/.claude/skills",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "project:1",
    display_name: "Demo",
    global_skills_dir: "~/Projects/Demo/.agents/skills",
    is_detected: true,
    is_builtin: false,
    is_enabled: true,
  },
  {
    id: "hermes",
    display_name: "Hermes",
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
      ["claude-code", "project:1"],
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
        display_name: "Shared Hub",
        global_skills_dir: "C:/Users/alice/.agents/skills",
        is_detected: true,
        is_builtin: true,
        is_enabled: true,
      },
      {
        id: "cursor",
        display_name: "Cursor",
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

describe("installation provenance", () => {
  it("keeps manual installs even when the target also uses Shared Hub", () => {
    const summary = buildInstallSummary(["central", "hermes"], ["central", "hermes"], agents);
    expect(summary.directPlatforms).toEqual([{ id: "hermes", name: "Hermes" }]);
    expect(summary.shared).toEqual([{ id: "hermes", name: "Hermes" }]);
  });

  it("uses explicit provenance, not writable flags, symlinks or central membership", () => {
    const row = { id: "demo", name: "demo", file_path: "demo/SKILL.md", dir_path: "demo",
      link_type: "symlink", is_central: false, is_read_only: false } satisfies ScannedSkill;
    expect(installationSourcesForSkill(row)).toEqual([]);
    expect(installationSourcesForSkill({ ...row, is_central: true, installation_source: "independent" })).toEqual(["shared"]);
    expect(installationSourcesForSkill({ ...row, installation_source: "independent" })).toEqual(["independent"]);
    expect(installationSourcesForSkill({ ...row, installation_source: "shared" })).toEqual(["shared"]);
    expect(installationSourcesForSkill({ ...row, source_kind: "shared-central" })).toEqual(["shared"]);
  });
});

it("selects shared counts for central members and manual counts only for other skills", () => {
  const summary = buildMembershipInstallSummary([
    { is_central: true, linked_agents: ["claude-code"], read_only_agents: ["hermes", "project:1"] },
    { is_central: false, linked_agents: ["project:1"], read_only_agents: ["claude-code"] },
  ], agents);
  expect(summary.directPlatforms).toEqual([]);
  expect(summary.directProjects).toEqual([{ id: "project:1", name: "Demo" }]);
  expect(summary.shared.map(target => target.id)).toEqual(["claude-code", "project:1", "hermes"]);
});

it("counts only enabled and detected targets, ignoring stale observations", () => {
  const summary = buildMembershipInstallSummary([{ is_central: true, shared_agents: ["stale"] }], [
    ...agents, { ...agents[0], id: "disabled", is_enabled: false }, { ...agents[0], id: "missing", is_detected: false }, { ...agents[0], id: "central" },
  ]);
  expect(summary.shared.map(target => target.id)).toEqual(["claude-code", "project:1", "hermes"]);
});

it("includes all Shared Hub members on an enabled target and removes manual duplicates", () => {
  const shared: SkillWithLinks = { id: "shared", name: "shared", file_path: "library/shared/SKILL.md", is_central: true, linked_agents: [], scanned_at: "2026-09-15" };
  const manual: ScannedSkill = { id: "manual", name: "manual", file_path: "manual/SKILL.md", dir_path: "manual", link_type: "copy", is_central: false, installation_source: "independent" };
  const rows = platformSkillsWithSharedHub([manual, { ...manual, id: "shared" }], [shared], true);
  expect(rows.map(row => row.id)).toEqual(["manual", "shared"]);
  expect(rows[1].installation_source).toBe("shared");
  expect(platformSkillsWithSharedHub([], [shared], false)).toEqual([]);
});
