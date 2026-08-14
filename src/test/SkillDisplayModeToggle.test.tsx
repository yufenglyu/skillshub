import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SkillDisplayModeToggle } from "@/components/skill/SkillDisplayModeToggle";

describe("SkillDisplayModeToggle", () => {
  it("renders flat and folder buttons with pressed state", () => {
    render(<SkillDisplayModeToggle value="folders" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "平铺" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "目录" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("requests organization mode changes", () => {
    const onChange = vi.fn();
    render(<SkillDisplayModeToggle value="folders" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "平铺" }));

    expect(onChange).toHaveBeenCalledWith("all");
  });
});
