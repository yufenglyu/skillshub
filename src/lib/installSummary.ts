import { isProjectAgentId } from "@/lib/projectTargets";
import type { AgentWithStatus } from "@/types";

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
  const linkedIds = uniqueIds(linkedAgentIds);
  const sharedIds = uniqueIds([
    ...(readOnlyAgentIds ?? []),
    ...linkedIds.filter((id) => agentsById.get(id)?.shares_central_skills),
  ]);
  const sharedIdSet = new Set(sharedIds);
  const directPlatforms: InstallSummaryTarget[] = [];
  const directProjects: InstallSummaryTarget[] = [];

  for (const id of linkedIds) {
    if (sharedIdSet.has(id)) continue;
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
