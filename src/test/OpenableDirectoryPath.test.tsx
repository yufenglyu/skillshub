import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenableDirectoryPath } from "@/components/common/OpenableDirectoryPath";
import * as tauriBridge from "@/lib/tauri";

describe("OpenableDirectoryPath", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders placeholder and empty paths as plain text", () => {
    const { rerender } = render(<OpenableDirectoryPath path="" displayPath="central.path" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("central.path")).toBeInTheDocument();

    rerender(<OpenableDirectoryPath path="resource.path" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the raw filesystem path when the displayed Windows path is clicked", async () => {
    const invokeSpy = vi.spyOn(tauriBridge, "invoke").mockResolvedValue(undefined);
    const rawPath = "C:/Users/LYF/.agents/skills";

    render(<OpenableDirectoryPath path={rawPath} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "在文件管理器中打开: C:\\Users\\LYF\\.agents\\skills",
      })
    );

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("open_in_file_manager", {
        path: rawPath,
      });
    });
  });
});
