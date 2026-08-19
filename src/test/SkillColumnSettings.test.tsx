import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SkillColumnSettings } from "@/components/skill/SkillColumnSettings";

describe("SkillColumnSettings", () => {
  it("opens column menu and toggles optional columns", () => {
    const onToggle = vi.fn();
    render(
      <SkillColumnSettings
        kind="skill"
        visibleColumns={new Set(["name", "source", "actions"])}
        onToggle={onToggle}
        onReset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "显示列" }));
    fireEvent.click(screen.getByLabelText("仓库"));

    expect(onToggle).toHaveBeenCalledWith("source");
  });

  it("keeps fixed columns disabled", () => {
    render(
      <SkillColumnSettings
        kind="skill"
        visibleColumns={new Set(["name", "actions"])}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "显示列" }));

    expect(screen.getByLabelText("序号")).toBeDisabled();
    expect(screen.getByLabelText("名称")).toBeDisabled();
    expect(screen.getByLabelText("操作")).toBeDisabled();
  });

  it("resets columns from the menu", () => {
    const onReset = vi.fn();
    render(
      <SkillColumnSettings
        kind="folder"
        visibleColumns={new Set(["name", "path", "actions"])}
        onToggle={vi.fn()}
        onReset={onReset}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "显示列" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复默认列" }));

    expect(onReset).toHaveBeenCalled();
  });
});
