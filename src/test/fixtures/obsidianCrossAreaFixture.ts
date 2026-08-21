import type { DiscoveredProject, DiscoveredSkill } from "@/types";

/** Sample discovered project used by Discover UI/store tests. */
export const OBSIDIAN_CROSS_AREA_FIXTURE = {
  fixtureRoot: "/tmp/skills-manage-val-cross-012",
  centralDir: "/tmp/skills-manage-val-cross-012/central",
  claudePlatformDir: "/tmp/skills-manage-val-cross-012/claude-platform-skills",
  cursorPlatformDir: "/tmp/skills-manage-val-cross-012/cursor-platform-skills",
  vaultParentPath: "/tmp/skills-manage-val-cross-012/projects",
  vaultPath: "/tmp/skills-manage-val-cross-012/projects/make-money",
  vaultName: "make-money",
  skillDirName: "money-researcher",
  skillName: "Money Researcher",
  skillDescription: "Correlated fixture skill",
  skillId: "claude-code__make-money__money-researcher",
  sourceLocation: ".agents/skills",
  sourceDirPath:
    "/tmp/skills-manage-val-cross-012/projects/make-money/.agents/skills/money-researcher",
  sourceFilePath:
    "/tmp/skills-manage-val-cross-012/projects/make-money/.agents/skills/money-researcher/SKILL.md",
  centralTargetPath: "/tmp/skills-manage-val-cross-012/central/money-researcher",
  symlinkPlatformTargetPath:
    "/tmp/skills-manage-val-cross-012/claude-platform-skills/money-researcher",
  copyPlatformTargetPath:
    "/tmp/skills-manage-val-cross-012/cursor-platform-skills/money-researcher",
  platformId: "claude-code",
  platformName: "Claude Code",
  installAgentId: "claude-code",
  installAgentName: "Claude Code",
  symlinkInstallMethod: "symlink",
  copyInstallMethod: "copy",
} as const;

export const obsidianCrossAreaSkill: DiscoveredSkill = {
  id: OBSIDIAN_CROSS_AREA_FIXTURE.skillId,
  name: OBSIDIAN_CROSS_AREA_FIXTURE.skillName,
  description: OBSIDIAN_CROSS_AREA_FIXTURE.skillDescription,
  file_path: OBSIDIAN_CROSS_AREA_FIXTURE.sourceFilePath,
  dir_path: OBSIDIAN_CROSS_AREA_FIXTURE.sourceDirPath,
  platform_id: OBSIDIAN_CROSS_AREA_FIXTURE.platformId,
  platform_name: OBSIDIAN_CROSS_AREA_FIXTURE.platformName,
  project_path: OBSIDIAN_CROSS_AREA_FIXTURE.vaultPath,
  project_name: OBSIDIAN_CROSS_AREA_FIXTURE.vaultName,
  is_already_central: false,
};

export const obsidianCrossAreaProject: DiscoveredProject = {
  project_path: OBSIDIAN_CROSS_AREA_FIXTURE.vaultPath,
  project_name: OBSIDIAN_CROSS_AREA_FIXTURE.vaultName,
  skills: [obsidianCrossAreaSkill],
};

export const obsidianCrossAreaProjects: DiscoveredProject[] = [obsidianCrossAreaProject];
