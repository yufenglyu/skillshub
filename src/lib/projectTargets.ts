import type { AgentWithStatus, ScanDirectory } from "@/types";
import { joinPathForDisplay, pathsShareSkillsRoot } from "@/lib/path";

export const PROJECT_AGENT_PREFIX = "project:";
export const PROJECT_SKILLS_SUBDIR = ".agents/skills";

export function projectAgentId(scanDirectoryId: number): string {
  return `${PROJECT_AGENT_PREFIX}${scanDirectoryId}`;
}

export function isProjectAgentId(agentId: string): boolean {
  return agentId.startsWith(PROJECT_AGENT_PREFIX);
}

export function projectSkillsDir(projectPath: string): string {
  return joinPathForDisplay(projectPath, PROJECT_SKILLS_SUBDIR);
}

export function projectDirectoryName(dir: ScanDirectory): string {
  const parts = dir.path.split(/[\\/]/).filter(Boolean);
  return dir.label?.trim() || parts[parts.length - 1] || dir.path;
}

export function scanDirectoryToProjectAgent(dir: ScanDirectory): AgentWithStatus {
  return {
    id: projectAgentId(dir.id),
    display_name: projectDirectoryName(dir),
    category: "project",
    global_skills_dir: projectSkillsDir(dir.path),
    project_skills_dir: PROJECT_SKILLS_SUBDIR,
    icon_name: "folder",
    is_detected: dir.is_active,
    is_builtin: false,
    is_enabled: dir.is_active,
  };
}

export function mergeProjectAgents(
  agents: AgentWithStatus[],
  scanDirectories: ScanDirectory[]
): AgentWithStatus[] {
  const centralRoot = agents.find((agent) => agent.id === "central")?.global_skills_dir;
  const projectAgents = scanDirectories
    .filter((dir) => !dir.is_builtin)
    .map((dir) => {
      const agent = scanDirectoryToProjectAgent(dir);
      return {
        ...agent,
        shares_central_skills: pathsShareSkillsRoot(agent.global_skills_dir, centralRoot),
      };
    });

  return [
    ...agents.filter((agent) => !isProjectAgentId(agent.id)),
    ...projectAgents,
  ];
}
