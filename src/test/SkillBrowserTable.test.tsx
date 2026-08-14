import { fireEvent, render, screen } from "@testing-library/react";
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
});
