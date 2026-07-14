import { create } from "zustand";
import { invoke, isTauriRuntime } from "@/lib/tauri";
import { AgentWithStatus, BatchInstallResult, SkillWithLinks } from "@/types";
import { BROWSER_FIXTURE_AGENTS } from "@/stores/centralSkillsStore";

const BROWSER_RESOURCE_SKILLS: SkillWithLinks[] = [
  {
    id: "fixture-resource-skill",
    name: "fixture-resource-skill",
    description: "Browser validation fixture for the Skill Resource Library.",
    file_path: "~/.skillsmanage/library/example/skills/fixture-resource-skill/SKILL.md",
    canonical_path: "~/.skillsmanage/library/example/skills/fixture-resource-skill",
    is_central: false,
    source: "browser-fixture",
    source_author: "example",
    source_repo: "example/skills",
    scanned_at: "2026-04-17T00:00:00.000Z",
    created_at: "2026-04-17T00:00:00.000Z",
    updated_at: "2026-04-17T00:00:00.000Z",
    linked_agents: [],
    read_only_agents: [],
  },
];

interface ResourceLibraryState {
  skills: SkillWithLinks[];
  agents: AgentWithStatus[];
  resourceLibraryDir: string;
  isLoading: boolean;
  isInstalling: boolean;
  isUpdatingSources: boolean;
  togglingAgentId: string | null;
  error: string | null;

  loadResourceLibrary: () => Promise<void>;
  installSkill: (
    skillId: string,
    agentIds: string[],
    method: string
  ) => Promise<BatchInstallResult>;
  togglePlatformLink: (skillId: string, agentId: string) => Promise<void>;
  updateSourceBackedSkills: () => Promise<string[]>;
  updateSourceBackedSkill: (skillId: string) => Promise<string>;
  addToCentral: (skillId: string) => Promise<void>;
}

export const useResourceLibraryStore = create<ResourceLibraryState>((set, get) => ({
  skills: [],
  agents: [],
  resourceLibraryDir: "",
  isLoading: false,
  isInstalling: false,
  isUpdatingSources: false,
  togglingAgentId: null,
  error: null,

  loadResourceLibrary: async () => {
    set({ isLoading: true, error: null });
    if (!isTauriRuntime()) {
      set({
        skills: BROWSER_RESOURCE_SKILLS,
        agents: BROWSER_FIXTURE_AGENTS,
        resourceLibraryDir: "~/.skillsmanage/library",
        isLoading: false,
      });
      return;
    }

    try {
      const [skills, agents, resourceLibraryDir] = await Promise.all([
        invoke<SkillWithLinks[]>("get_resource_library_skills"),
        invoke<AgentWithStatus[]>("get_agents"),
        invoke<string>("get_skill_resource_library_dir"),
      ]);
      set({
        skills: skills ?? [],
        agents: agents ?? [],
        resourceLibraryDir: resourceLibraryDir ?? "",
        isLoading: false,
      });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  installSkill: async (skillId, agentIds, method) => {
    set({ isInstalling: true, error: null });
    try {
      const result = await invoke<BatchInstallResult>("batch_install_to_agents", {
        skillId,
        agentIds,
        method,
      });
      const skills = await invoke<SkillWithLinks[]>("get_resource_library_skills");
      set({ skills: skills ?? [], isInstalling: false });
      return result;
    } catch (err) {
      set({ error: String(err), isInstalling: false });
      throw err;
    }
  },

  togglePlatformLink: async (skillId, agentId) => {
    set({ togglingAgentId: agentId, error: null });
    try {
      const skill = get().skills.find((candidate) => candidate.id === skillId);
      const isLinked = skill?.linked_agents.includes(agentId) ?? false;
      const isReadOnly = skill?.read_only_agents?.includes(agentId) ?? false;

      if (isReadOnly) {
        set({ togglingAgentId: null });
        return;
      }

      if (isLinked) {
        await invoke("uninstall_skill_from_agent", { skillId, agentId });
      } else {
        await invoke("install_skill_to_agent", { skillId, agentId, method: "auto" });
      }

      const skills = await invoke<SkillWithLinks[]>("get_resource_library_skills");
      set({ skills: skills ?? [], togglingAgentId: null });
    } catch (err) {
      set({ error: String(err), togglingAgentId: null });
      throw err;
    }
  },

  updateSourceBackedSkills: async () => {
    set({ isUpdatingSources: true, error: null });
    if (!isTauriRuntime()) {
      set({ isUpdatingSources: false });
      return [];
    }

    try {
      const updated = await invoke<string[]>("update_source_backed_central_skills");
      const skills = await invoke<SkillWithLinks[]>("get_resource_library_skills");
      set({ skills: skills ?? [], isUpdatingSources: false });
      return updated ?? [];
    } catch (err) {
      set({ error: String(err), isUpdatingSources: false });
      throw err;
    }
  },

  updateSourceBackedSkill: async (skillId) => {
    set({ isUpdatingSources: true, error: null });
    if (!isTauriRuntime()) {
      set({ isUpdatingSources: false });
      return skillId;
    }

    try {
      const updated = await invoke<string>("update_source_backed_central_skill", { skillId });
      const skills = await invoke<SkillWithLinks[]>("get_resource_library_skills");
      set({ skills: skills ?? [], isUpdatingSources: false });
      return updated;
    } catch (err) {
      set({ error: String(err), isUpdatingSources: false });
      throw err;
    }
  },

  addToCentral: async (skillId) => {
    set({ isInstalling: true, error: null });
    if (!isTauriRuntime()) {
      set({ isInstalling: false });
      return;
    }

    try {
      await invoke("add_resource_skill_to_central", { skillId });
      const skills = await invoke<SkillWithLinks[]>("get_resource_library_skills");
      set({ skills: skills ?? [], isInstalling: false });
    } catch (err) {
      set({ error: String(err), isInstalling: false });
      throw err;
    }
  },
}));
