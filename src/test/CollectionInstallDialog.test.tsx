import { render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
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

function renderDialog(
  overrides: Partial<ComponentProps<typeof CollectionInstallDialog>> = {}
) {
  return render(
    <CollectionInstallDialog
      open
      onOpenChange={vi.fn()}
      collectionName="Frontend"
      skillCount={2}
      agents={agents}
      isCentral={false}
      onInstall={vi.fn()}
      {...overrides}
    />
  );
}

describe("CollectionInstallDialog", () => {
  it("shows software platforms, project directories, and Central Skills, all unchecked by default", async () => {
    renderDialog();

    const dialog = await screen.findByRole("dialog", {
      name: /批量安装 — Frontend|Batch install — Frontend/i,
    });

    expect(
      within(dialog).getByRole("heading", { name: /软件平台|Software platforms/i })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: /项目目录|Project directories/i })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "中央技能库" })
    ).toBeInTheDocument();

    const cursor = within(dialog).getByLabelText("Cursor");
    const hermes = within(dialog).getByLabelText("Hermes");
    const home = within(dialog).getByLabelText("Home");
    const central = within(dialog).getByLabelText("中央技能库");

    expect(cursor).not.toBeChecked();
    expect(hermes).not.toBeChecked();
    expect(home).not.toBeChecked();
    expect(central).not.toBeChecked();
    expect(central).toBeEnabled();
    expect(
      within(dialog).getByRole("button", { name: /安装到 0 个目标/ })
    ).toBeDisabled();
  });

  it("installs the collection to Central Skills when that target is selected", async () => {
    const onInstall = vi.fn().mockResolvedValue({ succeeded: ["frontend-design:central"], failed: [] });
    const onOpenChange = vi.fn();
    renderDialog({ onInstall, onOpenChange });

    const dialog = await screen.findByRole("dialog", {
      name: /批量安装 — Frontend|Batch install — Frontend/i,
    });
    within(dialog).getByLabelText("中央技能库").click();
    within(dialog).getByRole("button", { name: /安装到 1 个目标/ }).click();

    await waitFor(() => {
      expect(onInstall).toHaveBeenCalledWith(["central"]);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("labels shared software and project targets as a centralize action and explains the sync scope", async () => {
    renderDialog();

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
    renderDialog({ isCentral: true });

    const dialog = await screen.findByRole("dialog", {
      name: /批量安装 — Frontend|Batch install — Frontend/i,
    });
    expect(within(dialog).getByLabelText("Hermes")).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByLabelText("Home")).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getAllByText("已通过中央库共享")).toHaveLength(2);
    expect(within(dialog).getByLabelText("中央技能库")).toBeEnabled();
    expect(within(dialog).getByLabelText("Cursor")).not.toBeChecked();
  });
});
