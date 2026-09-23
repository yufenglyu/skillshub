import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SkillBrowserTable, type FolderTableItem } from "@/components/skill/SkillBrowserTable";
import { useRepositoryNameStore } from "@/stores/repositoryNameStore";

beforeEach(() => useRepositoryNameStore.setState({ repositoryFirst: false }));

it("switches repository labels and sorts by the displayed name without changing folder identity", () => {
  const open = vi.fn();
  const folders: FolderTableItem[] = [
    { key: "a/z", name: "a/z", sourceRepo: "a/z", path: "/a/z", skillCount: 1, onOpen: open },
    { key: "b/a", name: "b/a", sourceRepo: "b/a", path: "/b/a", skillCount: 2, onOpen: vi.fn() },
    { key: "local", name: "local/folder", path: "/local/folder", skillCount: 0, onOpen: vi.fn() },
  ];
  const props = { kind: "folder" as const, visibleColumns: new Set(["name"]), folders, sortField: "name" as const, onSortChange: vi.fn(), nameHeaderAction: <button>Expand all</button> };
  const { rerender } = render(<SkillBrowserTable {...props} sortDirection="asc" />);
  const names = () => screen.getAllByRole("row").slice(1).map(row => within(row).getByRole("button").textContent);
  expect(names()).toEqual(["a/z", "b/a", "local/folder"]);
  fireEvent.click(screen.getByRole("button", { name: "切换为 仓库@作者" }));
  expect(names()).toEqual(["a@b", "local/folder", "z@a"]);
  fireEvent.click(screen.getByRole("button", { name: "z@a" }));
  expect(open).toHaveBeenCalledOnce();
  const header = screen.getByRole("columnheader", { name: "名称" });
  const buttons = within(header).getAllByRole("button");
  expect(buttons[1]).toHaveAccessibleName("切换为 作者/仓库");
  expect(buttons[2]).toHaveAccessibleName("Expand all");
  expect(buttons[1].parentElement).toHaveClass("ml-auto");
  fireEvent.click(buttons[0]);
  expect(props.onSortChange).toHaveBeenCalledWith("name", "desc");
  rerender(<SkillBrowserTable {...props} sortDirection="desc" />);
  expect(names()).toEqual(["z@a", "local/folder", "a@b"]);
  expect(JSON.parse(localStorage.getItem("skillshub-repository-name-format")!).state.repositoryFirst).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "切换为 作者/仓库" }));
  expect(names()).toEqual(["local/folder", "b/a", "a/z"]);
});

it("leaves ordinary folders without a repository format control", () => {
  render(<SkillBrowserTable kind="folder" visibleColumns={new Set(["name"])} folders={[{ key: "local", name: "local/folder", path: "/local/folder", skillCount: 0, onOpen: vi.fn() }]} />);
  expect(screen.queryByRole("button", { name: "切换为 仓库@作者" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "local/folder" })).toBeInTheDocument();
});
