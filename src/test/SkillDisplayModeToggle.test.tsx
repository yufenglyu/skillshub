import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SkillDisplayModeToggle } from "@/components/skill/SkillDisplayModeToggle";

describe("SkillDisplayModeToggle", () => {
  it("renders list and card buttons with pressed state", () => {
    render(<SkillDisplayModeToggle value="card" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "列表视图" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "卡片视图" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("requests display mode changes", () => {
    const onChange = vi.fn();
    render(<SkillDisplayModeToggle value="card" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "列表视图" }));

    expect(onChange).toHaveBeenCalledWith("list");
  });
});
