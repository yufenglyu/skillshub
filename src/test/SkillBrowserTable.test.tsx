import { act, fireEvent, render, screen } from "@testing-library/react";
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

    expect(screen.getByRole("columnheader", { name: "名称" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "创建时间" })).not.toBeInTheDocument();
    expect(screen.getByText("owner/repo")).toBeInTheDocument();
    expect(screen.getByText("Important internal note")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看 api-skill 的详情" }));
    expect(onDetail).toHaveBeenCalled();
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

  it("keeps platform install toggles in the install status column", () => {
    const onToggle = vi.fn();
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "installStatus"])}
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
              linkedAgents: [],
              readOnlyAgents: [],
              skillId: "skill-1",
              onToggle,
              togglingAgentId: null,
            },
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "切换 api-skill 在 Claude Code 的链接状态" }));

    expect(onToggle).toHaveBeenCalledWith("skill-1", "claude-code");
  });

  it("shows platform source location and install type together", () => {
    render(
      <SkillBrowserTable
        kind="skill"
        visibleColumns={new Set(["name", "installStatus"])}
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

    expect(screen.getByText("中央技能库")).toBeInTheDocument();
    expect(screen.getByText("符号链接")).toBeInTheDocument();
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

    expect(screen.getByRole("columnheader", { name: "名称" })).toHaveStyle({
      width: "444px",
    });
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

  it("renders folder created and updated columns as sortable headers", () => {
    render(
      <SkillBrowserTable
        kind="folder"
        visibleColumns={new Set(["name", "createdAt", "updatedAt", "actions"])}
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
  });
});
