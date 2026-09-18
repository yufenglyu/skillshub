import { it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppStatusBar } from "@/components/layout/AppStatusBar";
import { useAppStatusStore as actualStatusStore } from "@/stores/appStatusStore";
  it("shows imported skill details under import statistics", () => {
    // Render the shared status UI with a completed import task.
    actualStatusStore.setState({ task: { id: "import", kind: "import", label: "导入技能", status: "success", updatedCount: 1, skippedCount: 0,
      items: [{ skillId: "demo", name: "Imported Demo", repository: "Owner/Repo", status: "updated" }] } });
    render(<MemoryRouter><AppStatusBar /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "查看导入统计" }));
    const dialog = screen.getByRole("dialog", { name: "导入统计" });
    fireEvent.click(within(dialog).getByRole("button", { name: /导入成功/ }));
    expect(within(dialog).getByText("Imported Demo")).toBeInTheDocument();
    expect(within(dialog).getByText("Owner/Repo")).toBeInTheDocument();
    expect(within(dialog).queryByText("更新状态")).not.toBeInTheDocument();
  });
