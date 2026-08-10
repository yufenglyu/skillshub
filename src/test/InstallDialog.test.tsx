import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InstallDialog } from "@/components/central/InstallDialog";
import type { AgentWithStatus, SkillWithLinks } from "@/types";

const agents: AgentWithStatus[] = [
  {
    id: "cursor",
    display_name: "Cursor",
    category: "coding",
    global_skills_dir: "~/.cursor/skills",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "project:1",
    display_name: "temp",
    category: "project",
    global_skills_dir: "~/Projects/temp/.agents/skills",
    project_skills_dir: ".agents/skills",
    is_detected: true,
    is_builtin: false,
    is_enabled: true,
  },
  {
    id: "central",
    display_name: "Central Skills",
    category: "central",
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
    expect(within(dialog).queryByLabelText("Central Skills")).not.toBeInTheDocument();
  });
});
