import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InstallDialog } from "@/components/central/InstallDialog";
import type { AgentWithStatus, SkillWithLinks } from "@/types";

const agents: AgentWithStatus[] = [
  {
    id: "cursor",
    display_name: "Cursor",
    global_skills_dir: "~/.cursor/skills",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "project:1",
    display_name: "temp",
    global_skills_dir: "~/Projects/temp/.agents/skills",
    project_skills_dir: ".agents/skills",
    is_detected: true,
    is_builtin: false,
    is_enabled: true,
  },
  {
    id: "central",
    display_name: "Shared Hub",
    global_skills_dir: "~/.agents/skills",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
];

const skill: SkillWithLinks = {
  id: "api-design",
  name: "api-design",
  description: "API design",
  file_path: "~/.agents/skills/api-design/SKILL.md",
  canonical_path: "~/.agents/skills/api-design",
  is_central: true,
  scanned_at: "2026-07-14T00:00:00Z",
  created_at: "2026-07-14T00:00:00Z",
  updated_at: "2026-07-14T00:00:00Z",
  linked_agents: ["cursor"],
  read_only_agents: [],
};

describe("InstallDialog", () => {
  it("groups install targets by software platform and project directory", async () => {
    render(
      <InstallDialog
        open
        onOpenChange={vi.fn()}
        skill={skill}
        agents={agents}
        onInstall={vi.fn()}
      />
    );

    const dialog = await screen.findByRole("dialog", { name: /安装 api-design|Install api-design/i });

    expect(
      within(dialog).getByRole("heading", { name: /软件平台|Software platforms/i })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: /项目目录|Project directories/i })
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Cursor")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("temp")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Shared Hub")).not.toBeInTheDocument();
  });

  it("disables a shared platform that already receives the skill through Shared Hub", async () => {
    render(
      <InstallDialog
        open
        onOpenChange={vi.fn()}
        skill={skill}
        agents={[
          ...agents,
          {
            id: "hermes",
            display_name: "Hermes",
            global_skills_dir: "~/.agents/skills",
            is_detected: true,
            is_builtin: true,
            is_enabled: true,
            shares_central_skills: true,
          },
        ]}
        onInstall={vi.fn()}
      />
    );

    const dialog = await screen.findByRole("dialog", { name: /安装 api-design|Install api-design/i });
    expect(within(dialog).getByLabelText("Hermes")).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByText("已通过共享中心共享")).toBeInTheDocument();
  });

  it("labels a shared platform as a centralize action and explains the sync scope", async () => {
    render(
      <InstallDialog
        open
        onOpenChange={vi.fn()}
        skill={{ ...skill, is_central: false }}
        agents={[
          ...agents,
          {
            id: "hermes",
            display_name: "Hermes",
            global_skills_dir: "~/.agents/skills",
            is_detected: true,
            is_builtin: true,
            is_enabled: true,
            shares_central_skills: true,
          },
        ]}
        onInstall={vi.fn()}
      />
    );

    const dialog = await screen.findByRole("dialog", { name: /安装 api-design|Install api-design/i });
    const shared = within(dialog).getByLabelText("Hermes");
    expect(shared).toBeEnabled();
    expect(within(dialog).getByText("将加入共享中心")).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/选中的共享平台会按共享中心规则同步/)
    ).not.toBeInTheDocument();

    shared.click();
    expect(
      within(dialog).getByText(/选中的共享平台会按共享中心规则同步/)
    ).toBeInTheDocument();
  });

  it("treats a project directory that shares the central root as a shared target", async () => {
    render(
      <InstallDialog
        open
        onOpenChange={vi.fn()}
        skill={{ ...skill, is_central: false }}
        agents={[
          ...agents,
          {
            id: "project:home",
            display_name: "Home",
            global_skills_dir: "~/.agents/skills",
            project_skills_dir: ".agents/skills",
            is_detected: true,
            is_builtin: false,
            is_enabled: true,
            shares_central_skills: true,
          },
        ]}
        onInstall={vi.fn()}
      />
    );

    const dialog = await screen.findByRole("dialog", { name: /安装 api-design|Install api-design/i });
    const sharedProject = within(dialog).getByLabelText("Home");
    expect(sharedProject).toBeEnabled();
    expect(within(dialog).getByText("将加入共享中心")).toBeInTheDocument();

    sharedProject.click();
    expect(
      within(dialog).getByText(/选中的共享平台会按共享中心规则同步/)
    ).toBeInTheDocument();
  });

  it("disables a shared project directory when the skill is already central", async () => {
    render(
      <InstallDialog
        open
        onOpenChange={vi.fn()}
        skill={skill}
        agents={[
          ...agents,
          {
            id: "project:home",
            display_name: "Home",
            global_skills_dir: "~/.agents/skills",
            project_skills_dir: ".agents/skills",
            is_detected: true,
            is_builtin: false,
            is_enabled: true,
            shares_central_skills: true,
          },
        ]}
        onInstall={vi.fn()}
      />
    );

    const dialog = await screen.findByRole("dialog", { name: /安装 api-design|Install api-design/i });
    expect(within(dialog).getByLabelText("Home")).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByText("已通过共享中心共享")).toBeInTheDocument();
  });
});
