import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollectionInstallDialog } from "@/components/collection/CollectionInstallDialog";
import type { AgentWithStatus } from "@/types";

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
    id: "hermes",
    display_name: "Hermes",
    category: "coding",
    global_skills_dir: "~/.agents/skills",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
    shares_central_skills: true,
  },
  {
    id: "project:home",
    display_name: "Home",
    category: "project",
    global_skills_dir: "~/.agents/skills",
    project_skills_dir: ".agents/skills",
    is_detected: true,
    is_builtin: false,
    is_enabled: true,
    shares_central_skills: true,
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

describe("CollectionInstallDialog", () => {
  it("labels shared software and project targets as a centralize action and explains the sync scope", async () => {
    render(
      <CollectionInstallDialog
        open
        onOpenChange={vi.fn()}
        collectionName="Frontend"
        skillCount={2}
        agents={agents}
        isCentral={false}
        onInstall={vi.fn()}
      />
    );

    const dialog = await screen.findByRole("dialog", {
      name: /批量安装 — Frontend|Batch install — Frontend/i,
    });
    const hermes = within(dialog).getByLabelText("Hermes");
    const home = within(dialog).getByLabelText("Home");

    expect(hermes).toBeEnabled();
    expect(home).toBeEnabled();
    expect(within(dialog).getAllByText("将加入中央技能库")).toHaveLength(2);
    expect(hermes).not.toBeChecked();
    expect(home).not.toBeChecked();
    expect(
      within(dialog).queryByText(/选中的共享平台会按中央库规则同步/)
    ).not.toBeInTheDocument();

    hermes.click();
    expect(
      within(dialog).getByText(/选中的共享平台会按中央库规则同步/)
    ).toBeInTheDocument();
  });

  it("disables shared software and project targets when every collection skill is already central", async () => {
    render(
      <CollectionInstallDialog
        open
        onOpenChange={vi.fn()}
        collectionName="Frontend"
        skillCount={2}
        agents={agents}
        isCentral
        onInstall={vi.fn()}
      />
    );

    const dialog = await screen.findByRole("dialog", {
      name: /批量安装 — Frontend|Batch install — Frontend/i,
    });
    expect(within(dialog).getByLabelText("Hermes")).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByLabelText("Home")).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getAllByText("已通过中央库共享")).toHaveLength(2);
  });
});
