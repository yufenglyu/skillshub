import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useSkillDisplayMode } from "@/hooks/useSkillDisplayMode";
import { useSkillTableColumns } from "@/hooks/useSkillTableColumns";

describe("skill browser preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists display mode globally", () => {
    const { result, rerender } = renderHook(() => useSkillDisplayMode());

    expect(result.current[0]).toBe("card");

    act(() => result.current[1]("list"));
    rerender();

    expect(result.current[0]).toBe("list");
  });

  it("persists skill table columns", () => {
    const { result, rerender } = renderHook(() => useSkillTableColumns("skill"));

    expect(result.current.visibleColumns.has("source")).toBe(true);

    act(() => result.current.toggleColumn("source"));
    rerender();

    expect(result.current.visibleColumns.has("source")).toBe(false);
  });

  it("does not toggle fixed skill columns", () => {
    const { result } = renderHook(() => useSkillTableColumns("skill"));

    act(() => result.current.toggleColumn("name"));
    act(() => result.current.toggleColumn("actions"));

    expect(result.current.visibleColumns.has("name")).toBe(true);
    expect(result.current.visibleColumns.has("actions")).toBe(true);
  });
});
