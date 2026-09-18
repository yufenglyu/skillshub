import { isProjectAgentId } from "@/lib/projectTargets";
import type { AgentWithStatus, ScannedSkill, SkillWithLinks } from "@/types";

export interface InstallSummaryTarget {
  id: string;
  name: string;
}

export interface InstallSummary {
  directPlatforms: InstallSummaryTarget[];
  directProjects: InstallSummaryTarget[];
  shared: InstallSummaryTarget[];
}

function uniqueIds(ids: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function resolveTarget(
  id: string,
  agentsById: Map<string, AgentWithStatus>
): InstallSummaryTarget {
  return {
    id,
    name: agentsById.get(id)?.display_name ?? id,
  };
}

export function uniqueAgentIds(
  lists: Array<readonly string[] | null | undefined>
): string[] {
  return uniqueIds(lists.flatMap((list) => [...(list ?? [])]));
}

export function buildInstallSummary(
  linkedAgentIds: readonly string[] | null | undefined,
  readOnlyAgentIds: readonly string[] | null | undefined,
  agents: readonly AgentWithStatus[] | null | undefined
): InstallSummary {
  const agentList = agents ?? [];
  const agentsById = new Map(agentList.map((agent) => [agent.id, agent]));
  // linkedAgentIds contains explicit application-managed installation records.
  // A target can also expose Shared Hub skills; that does not erase a manual install.
  const linkedIds = uniqueIds(linkedAgentIds).filter((id) => id !== "central");
  const sharedIds = uniqueIds(readOnlyAgentIds).filter((id) => id !== "central");
  const directPlatforms: InstallSummaryTarget[] = [];
  const directProjects: InstallSummaryTarget[] = [];

  for (const id of linkedIds) {
    const target = resolveTarget(id, agentsById);
    if (isProjectAgentId(id)) {
      directProjects.push(target);
    } else {
      directPlatforms.push(target);
    }
  }

  return {
    directPlatforms,
    directProjects,
    shared: sharedIds.map((id) => resolveTarget(id, agentsById)),
  };
}

export function formatInstallSummaryTooltip(
  t: (key: string, options?: Record<string, unknown>) => string,
  summary: InstallSummary
): string {
  const lines: string[] = [];
  if (summary.directPlatforms.length > 0) {
    lines.push(
      t("skillBrowser.installSummaryTooltipPlatforms", {
        names: summary.directPlatforms.map((target) => target.name).join(", "),
      })
    );
  }
  if (summary.directProjects.length > 0) {
    lines.push(
      t("skillBrowser.installSummaryTooltipProjects", {
        names: summary.directProjects.map((target) => target.name).join(", "),
      })
    );
  }
  if (summary.shared.length > 0) {
    lines.push(
      t("skillBrowser.installSummaryTooltipShared", {
        names: summary.shared.map((target) => target.name).join(", "),
      })
    );
  }
  return lines.join("\n") || t("skillBrowser.installSummaryTooltipNone");
}

/** Do not infer installation provenance from filesystem permissions or link type. */
export function installationSourcesForSkill(skill: ScannedSkill): Array<"independent" | "shared"> {
  if (skill.is_central) return ["shared"];
  if (skill.installation_source) return [skill.installation_source];
  // Compatibility with older Shared Hub rows, including writable shared roots.
  if (skill.source_kind === "shared-central" || skill.source_kind === "compatibility") return ["shared"];
  return [];
}

export interface InstallSummaryMember {
  is_central: boolean;
  shared_agents?: readonly string[];
  linked_agents?: readonly string[];
  read_only_agents?: readonly string[];
}

export function buildMembershipInstallSummary(members: readonly InstallSummaryMember[], agents: readonly AgentWithStatus[]): InstallSummary {
  const sharedTargets = agents.filter(agent => agent.id !== "central" && agent.is_enabled && agent.is_detected).map(agent => agent.id);
  return buildInstallSummary(
    members.filter(skill => !skill.is_central).flatMap(skill => [...(skill.linked_agents ?? [])]),
    members.some(skill => skill.is_central) ? sharedTargets : [],
    agents,
  );
}

/** Each enabled target receives all Shared Hub members; manual duplicates count once. */
export function platformSkillsWithSharedHub(installed: readonly ScannedSkill[], shared: readonly SkillWithLinks[], enabled: boolean): ScannedSkill[] {
  if (!enabled) return [...installed];
  const sharedById = new Map(shared.map(skill => [skill.id, skill]));
  const independent = installed.filter(skill => !sharedById.has(skill.id));
  return [...independent, ...shared.map(skill => ({
    ...skill,
    row_id: skill.id,
    dir_path: skill.canonical_path ?? skill.file_path.replace(/[\\/]SKILL\.md$/i, ""),
    link_type: "shared",
    is_central: true,
    is_read_only: true,
    installation_source: "shared" as const,
    source_kind: "shared-central" as const,
  }))];
}
