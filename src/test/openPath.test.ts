import { beforeEach, describe, expect, it, vi } from "vitest";

import { openInFileManager } from "@/lib/openPath";
import * as tauriBridge from "@/lib/tauri";

describe("openInFileManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not invoke for empty or whitespace paths", async () => {
    const invokeSpy = vi.spyOn(tauriBridge, "invoke").mockResolvedValue(undefined);

    await openInFileManager("");
    await openInFileManager("   ");

    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("sends the trimmed filesystem path, not a display-only spelling", async () => {
    const invokeSpy = vi.spyOn(tauriBridge, "invoke").mockResolvedValue(undefined);

    await openInFileManager("  C:/Users/LYF/.agents/skills  ");

    expect(invokeSpy).toHaveBeenCalledWith("open_in_file_manager", {
      path: "C:/Users/LYF/.agents/skills",
    });
  });
});
