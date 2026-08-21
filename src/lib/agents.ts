import type { AgentWithStatus } from "@/types";

export const CENTRAL_AGENT_ID = "central";

const NON_INSTALL_TARGET_AGENT_IDS = new Set([CENTRAL_AGENT_ID]);

export function isInstallTargetAgent(agent: Pick<AgentWithStatus, "id">): boolean {
  return !NON_INSTALL_TARGET_AGENT_IDS.has(agent.id);
}

/** Collection batch install may also target Central Skills. */
export function isCollectionInstallTargetAgent(
  _agent: Pick<AgentWithStatus, "id">
): boolean {
  return true;
}

export function isEnabledInstallTargetAgent(
  agent: Pick<AgentWithStatus, "id" | "is_enabled">
): boolean {
  return isInstallTargetAgent(agent) && agent.is_enabled;
}
