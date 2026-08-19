import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStatusStore } from "@/stores/appStatusStore";

describe("appStatusStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T04:05:06.000Z"));
    useAppStatusStore.getState().resetStatus();
  });

  it("tracks a running task and its successful result", () => {
    useAppStatusStore.getState().startTask({
      id: "resource-source-update",
      label: "Updating sources",
      detail: "Connecting",
    });

    expect(useAppStatusStore.getState().task).toMatchObject({
      id: "resource-source-update",
      label: "Updating sources",
      detail: "Connecting",
      status: "running",
      startedAt: "2026-08-12T04:05:06.000Z",
    });

    useAppStatusStore.getState().completeTask({
      detail: "Updated 3 skills",
      updatedCount: 3,
      unchangedCount: 1,
      skippedCount: 2,
      failedCount: 1,
      items: [
        { name: "ask-matt", status: "updated", detail: "Updated" },
        { name: "frontend-design", status: "unchanged" },
        { name: "local-demo", status: "skipped", detail: "Local folder" },
      ],
    });

    expect(useAppStatusStore.getState().task).toMatchObject({
      id: "resource-source-update",
      label: "Updating sources",
      detail: "Updated 3 skills",
      status: "success",
      updatedCount: 3,
      unchangedCount: 1,
      skippedCount: 2,
      failedCount: 1,
      items: [
        { name: "ask-matt", status: "updated", detail: "Updated" },
        { name: "frontend-design", status: "unchanged" },
        { name: "local-demo", status: "skipped", detail: "Local folder" },
      ],
      completedAt: "2026-08-12T04:05:06.000Z",
    });
  });

  it("records failed task details", () => {
    useAppStatusStore.getState().startTask({
      id: "resource-source-update",
      label: "Updating sources",
    });

    useAppStatusStore.getState().failTask({
      detail: "Failed to connect",
      error: "network",
    });

    expect(useAppStatusStore.getState().task).toMatchObject({
      status: "error",
      detail: "Failed to connect",
      error: "network",
    });
  });
});
