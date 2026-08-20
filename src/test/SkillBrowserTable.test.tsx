import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SkillBrowserTable } from "@/components/skill/SkillBrowserTable";

describe("SkillBrowserTable", () => {
  it("renders selected skill columns and actions", () => {
    const onDetail = vi.fn();
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "source", "notes", "actions"])}
        skills={[
          {
            rowKey: "one",
            name: "api-skill",
            description: "Design APIs",
            notes: "Important internal note",
            sourceRepo: "owner/repo",
            onDetail,
          },
        ]}
      />
    );

    expect(screen.getByRole("columnheader", { name: "序号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "序号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "名称" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "创建时间" })).not.toBeInTheDocument();
    expect(screen.getByText("owner/repo")).toBeInTheDocument();
    expect(screen.getByText("Important internal note")).toBeInTheDocument();
    expect(screen.queryByText("Design APIs")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看 api-skill 的详情" }));
    expect(onDetail).toHaveBeenCalled();
  });

  it("shows a leftmost index column for skills and folders", () => {
    const { rerender } = render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "actions"])}
        skills={[
          { rowKey: "one", name: "api-skill" },
          { rowKey: "two", name: "cli-skill" },
        ]}
      />
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-label"))
    ).toEqual(["序号", "名称", "操作"]);
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();

    rerender(
      <SkillBrowserTable
        kind="folder"
        visibleColumns={new Set(["name", "actions"])}
        folders={[
          {
            key: "owner/repo",
            name: "owner/repo",
            path: "D:/Skills/owner/repo",
            skillCount: 3,
            onOpen: vi.fn(),
          },
          {
            key: "other/repo",
            name: "other/repo",
            path: "D:/Skills/other/repo",
            skillCount: 1,
            onOpen: vi.fn(),
          },
        ]}
      />
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-label"))
    ).toEqual(["序号", "名称", "操作"]);
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
  });

  it("sorts from sortable column headers and keeps the actions header left aligned", () => {
    const onSortChange = vi.fn();
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "source", "createdAt", "updatedAt", "actions"])}
        sortField="name"
        sortDirection="asc"
        onSortChange={onSortChange}
        skills={[
          {
            rowKey: "one",
            name: "api-skill",
            sourceRepo: "owner/repo",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "仓库" }));
    expect(onSortChange).toHaveBeenCalledWith("source", "asc");
    expect(screen.getByRole("button", { name: "仓库" })).toHaveTextContent("↕");

    fireEvent.click(screen.getByRole("button", { name: "名称，升序排序" }));
    expect(onSortChange).toHaveBeenCalledWith("name", "desc");
    expect(screen.getByRole("button", { name: "名称，升序排序" })).toHaveTextContent("↑");

    expect(screen.getByRole("columnheader", { name: "操作" }).className).not.toContain(
      "text-right"
    );
  });

  it("opens column settings from a header context menu", () => {
    const onToggleColumn = vi.fn();
    render(
      <SkillBrowserTable
        kind="folder"
        visibleColumns={new Set(["name", "path", "actions"])}
        onToggleColumn={onToggleColumn}
        onResetColumns={vi.fn()}
        folders={[
          {
            key: "owner/repo",
            name: "owner/repo",
            path: "D:/Skills/owner/repo",
            skillCount: 3,
            onOpen: vi.fn(),
          },
        ]}
      />
    );

    fireEvent.contextMenu(screen.getByRole("columnheader", { name: "路径" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "路径" }));

    expect(onToggleColumn).toHaveBeenCalledWith("path");
  });

  it("clips folder paths inside the path column so they do not overlap skill counts", () => {
    render(
      <SkillBrowserTable
        kind="folder"
        visibleColumns={new Set(["name", "path", "skillCount"])}
        folders={[
          {
            key: "owner/repo",
            name: "addyosmani/agent-skills",
            path: "D:\\Data\\Codes\\AI\\Skills\\addyosmani\\agent-skills",
            skillCount: 24,
            onOpen: vi.fn(),
          },
        ]}
      />
    );

    const pathCell = screen.getByText("D:\\Data\\Codes\\AI\\Skills\\addyosmani\\agent-skills");
    expect(pathCell).toHaveClass("truncate", "w-0", "min-w-full");
    expect(pathCell.parentElement).toHaveClass("overflow-hidden");
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("shows only aggregate counts in the install summary column", () => {
    const onToggle = vi.fn();
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "installSummary"])}
        skills={[
          {
            rowKey: "one",
            name: "api-skill",
            platformIcons: {
              agents: [
                {
                  id: "claude-code",
                  display_name: "Claude Code",
                  global_skills_dir: "C:/Users/LYF/.claude/skills",
                  category: "coding",
                  is_detected: true,
                  is_builtin: true,
                  is_enabled: true,
                },
              ],
              linkedAgents: ["claude-code"],
              readOnlyAgents: [],
              skillId: "skill-1",
              onToggle,
              togglingAgentId: null,
            },
          },
        ]}
      />
    );

    expect(screen.getByText("直接安装 1（平台 1 / 项目 0）")).toBeInTheDocument();
    expect(screen.getByText("共享可用 0")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "切换 api-skill 在 Claude Code 的链接状态" })
    ).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("splits install summary into platforms, projects, and shared targets", () => {
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "installSummary"])}
        skills={[
          {
            rowKey: "one",
            name: "api-skill",
            installAgents: [
              {
                id: "claude-code",
                display_name: "Claude Code",
                global_skills_dir: "C:/Users/LYF/.claude/skills",
                category: "coding",
                is_detected: true,
                is_builtin: true,
                is_enabled: true,
              },
              {
                id: "project:1",
                display_name: "Demo",
                global_skills_dir: "C:/Projects/Demo/.agents/skills",
                category: "project",
                is_detected: true,
                is_builtin: false,
                is_enabled: true,
              },
              {
                id: "hermes",
                display_name: "Hermes",
                global_skills_dir: "C:/Users/LYF/.agents/skills",
                category: "coding",
                is_detected: true,
                is_builtin: true,
                is_enabled: true,
                shares_central_skills: true,
              },
            ],
            installLinkedAgentIds: ["claude-code", "project:1"],
            installReadOnlyAgentIds: ["hermes"],
          },
        ]}
      />
    );

    expect(screen.getByText("直接安装 2（平台 1 / 项目 1）")).toBeInTheDocument();
    expect(screen.getByText("共享可用 1")).toBeInTheDocument();
    expect(screen.getByLabelText(/平台：Claude Code/)).toHaveAttribute(
      "title",
      expect.stringContaining("项目：Demo")
    );
  });

  it("keeps platform source details out of the installation summary column", () => {
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "installSummary"])}
        skills={[
          {
            rowKey: "one",
            name: "api-skill",
            sourceType: "symlink",
            sourceLocation: "central",
          },
        ]}
      />
    );

    expect(screen.getByText("直接安装 0（平台 0 / 项目 0）")).toBeInTheDocument();
    expect(screen.getByText("共享可用 0")).toBeInTheDocument();
    expect(screen.queryByText("中央技能库")).not.toBeInTheDocument();
    expect(screen.queryByText("符号链接")).not.toBeInTheDocument();
  });

  it("renders the four resource actions with paired plus and minus icons", () => {
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "actions"])}
        skills={[
          {
            rowKey: "available",
            name: "available",
            isCentral: false,
            onInstallToCentral: vi.fn(),
            installToCentralLabel: "加入中央技能库",
            onInstallTo: vi.fn(),
            installToLabel: "安装到平台或项目",
            onUpdateFromSource: vi.fn(),
            updateFromSourceLabel: "更新",
            onDeleteFromCentral: vi.fn(),
            deleteFromCentralLabel: "删除",
          },
          {
            rowKey: "installed",
            name: "installed",
            isCentral: true,
            onRemoveFromCentral: vi.fn(),
            removeFromCentralLabel: "从中央技能库移除",
            onUninstallFromPlatform: vi.fn(),
            uninstallFromLabel: "从平台或项目卸载",
            onUpdateFromSource: vi.fn(),
            updateFromSourceLabel: "更新",
            onDeleteFromCentral: vi.fn(),
            deleteFromCentralLabel: "删除",
          },
        ]}
      />
    );

    const availableRow = screen.getByRole("row", { name: /available/ });
    expect(within(availableRow).getByRole("button", { name: "加入中央技能库" })).toBeInTheDocument();
    expect(within(availableRow).getByRole("button", { name: "安装到平台或项目" })).toBeInTheDocument();
    expect(availableRow.querySelector(".lucide-plus")).toBeInTheDocument();
    expect(availableRow.querySelector(".lucide-package-plus")).toBeInTheDocument();

    const installedRow = screen.getByRole("row", { name: /installed/ });
    expect(within(installedRow).getByRole("button", { name: "从中央技能库移除" })).toBeInTheDocument();
    expect(within(installedRow).getByRole("button", { name: "从平台或项目卸载" })).toBeInTheDocument();
    expect(installedRow.querySelector(".lucide-minus")).toBeInTheDocument();
    expect(installedRow.querySelector(".lucide-package-minus")).toBeInTheDocument();
  });

  it("resizes a column from the header resize handle", () => {
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "source", "actions"])}
        skills={[{ rowKey: "one", name: "api-skill", sourceRepo: "owner/repo" }]}
      />
    );

    const handle = screen.getByRole("separator", { name: "调整 名称 列宽" });
    fireEvent.pointerDown(handle, { clientX: 100 });
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 160 }));
      document.dispatchEvent(new PointerEvent("pointerup"));
    });

    const nameColumn = document.querySelectorAll("colgroup col")[1];
    expect(nameColumn).toHaveStyle({
      width: "444px",
    });

    fireEvent.doubleClick(handle);
    const fittedWidth = Number.parseInt(nameColumn.getAttribute("style")?.match(/width:\s*(\d+)/)?.[1] ?? "0", 10);
    expect(fittedWidth).toBeGreaterThanOrEqual(80);
    expect(fittedWidth).toBeLessThan(200);
  });

  it("lets the index column be resized below the default column minimum", () => {
    window.localStorage.removeItem("skills-manage.skillTableColumnWidths.skill");
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "actions"])}
        skills={[{ rowKey: "one", name: "api-skill" }]}
      />
    );

    const indexColumn = document.querySelector("colgroup col");
    expect(indexColumn).toHaveStyle({ width: "40px" });

    const handle = screen.getByRole("separator", { name: "调整 序号 列宽" });
    fireEvent.pointerDown(handle, { clientX: 100 });
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 70 }));
      document.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(indexColumn).toHaveStyle({ width: "32px" });
  });

  it("renders folder rows and invokes folder actions", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(
      <SkillBrowserTable
        kind="folder"
        visibleColumns={new Set(["name", "skillCount", "actions"])}
        folders={[
          {
            key: "owner/repo",
            name: "owner/repo",
            path: "D:/Skills/owner/repo",
            skillCount: 3,
            onOpen,
            onDelete,
            deleteLabel: "删除目录 owner/repo",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "owner/repo" }));
    expect(onOpen).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "删除目录 owner/repo" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("uses paired folder install and uninstall actions", () => {
    render(
      <SkillBrowserTable
        kind="folder"
        visibleColumns={new Set(["name", "actions"])}
        folders={[
          {
            key: "owner/repo",
            name: "owner/repo",
            path: "D:/Skills/owner/repo",
            skillCount: 3,
            onOpen: vi.fn(),
            onUninstall: vi.fn(),
            uninstallLabel: "卸载目录",
            onInstall: vi.fn(),
            installLabel: "安装到平台/项目",
            onDelete: vi.fn(),
            deleteLabel: "删除目录",
          },
        ]}
      />
    );

    const row = screen.getByRole("row", { name: /owner\/repo/ });
    const actionLabels = within(row)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter(Boolean);

    expect(actionLabels).toEqual([
      "卸载目录",
      "删除目录",
    ]);
    expect(row.querySelector(".lucide-package-minus")).toBeInTheDocument();
    expect(row.querySelector(".lucide-package-plus")).not.toBeInTheDocument();
  });

  it("renders folder created and updated columns as sortable headers", () => {
    render(
      <SkillBrowserTable
        kind="folder"
        visibleColumns={new Set(["name", "createdAt", "updatedAt", "installSummary", "actions"])}
        sortField="name"
        sortDirection="asc"
        onSortChange={vi.fn()}
        folders={[
          {
            key: "owner/repo",
            name: "owner/repo",
            path: "D:/Skills/owner/repo",
            skillCount: 3,
            createdAt: "2026-07-14T00:00:00Z",
            updatedAt: "2026-08-14T00:00:00Z",
            onOpen: vi.fn(),
          },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "创建时间" })).toHaveTextContent("↕");
    expect(screen.getByRole("button", { name: "更新时间" })).toHaveTextContent("↕");
    expect(screen.getByText("2026-07-14")).toBeInTheDocument();
    expect(screen.getByText("2026-08-14")).toBeInTheDocument();
    expect(
      screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-label"))
    ).toEqual(["序号", "名称", "创建时间", "更新时间", "安装统计", "操作"]);
  });

  it("splits folder install summary into platforms, projects, and shared targets", () => {
    render(
      <SkillBrowserTable
        kind="folder"
        visibleColumns={new Set(["name", "installSummary"])}
        folders={[
          {
            key: "owner/repo",
            name: "owner/repo",
            path: "D:/Skills/owner/repo",
            skillCount: 3,
            installAgents: [
              {
                id: "claude-code",
                display_name: "Claude Code",
                global_skills_dir: "C:/Users/LYF/.claude/skills",
                category: "coding",
                is_detected: true,
                is_builtin: true,
                is_enabled: true,
              },
              {
                id: "project:1",
                display_name: "Demo",
                global_skills_dir: "C:/Projects/Demo/.agents/skills",
                category: "project",
                is_detected: true,
                is_builtin: false,
                is_enabled: true,
              },
              {
                id: "hermes",
                display_name: "Hermes",
                global_skills_dir: "C:/Users/LYF/.agents/skills",
                category: "coding",
                is_detected: true,
                is_builtin: true,
                is_enabled: true,
                shares_central_skills: true,
              },
            ],
            installLinkedAgentIds: ["claude-code", "project:1"],
            installReadOnlyAgentIds: ["hermes"],
            onOpen: vi.fn(),
          },
        ]}
      />
    );

    expect(screen.getByText("直接安装 2（平台 1 / 项目 1）")).toBeInTheDocument();
    expect(screen.getByText("共享可用 1")).toBeInTheDocument();
    expect(screen.getByLabelText(/平台：Claude Code/)).toHaveAttribute(
      "title",
      expect.stringContaining("项目：Demo")
    );
  });
});
