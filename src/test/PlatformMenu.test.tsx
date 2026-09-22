import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlatformMenu } from "@/components/layout/PlatformMenu";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePlatformStore } from "@/stores/platformStore";
import type { AgentWithStatus } from "@/types";
const platform: AgentWithStatus = {
  id: "example",
  display_name: "Example",
  global_skills_dir: "/example/skills",
  is_enabled: true,
  is_detected: true,
  is_builtin: true,
};
const rescan = vi.fn().mockResolvedValue(undefined);
const toggle = vi.fn().mockResolvedValue(platform);
const remove = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  vi.clearAllMocks();
  usePlatformStore.setState({ agents: [platform], rescan });
  useSettingsStore.setState({
    toggleAgentEnabled: toggle,
    removeCustomAgent: remove,
  });
});
it("opens platform creation from the heading context menu", () => {
  render(
    <MemoryRouter>
      <PlatformMenu>
        <button>Platforms</button>
      </PlatformMenu>
    </MemoryRouter>,
  );
  fireEvent.contextMenu(screen.getByText("Platforms"));
  fireEvent.click(screen.getByRole("menuitem", { name: "添加平台" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("edits existing platforms, toggles enablement and confirms removal", async () => {
  const view = render(
    <MemoryRouter>
      <PlatformMenu platform={platform}>
        <button>Example</button>
      </PlatformMenu>
    </MemoryRouter>,
  );
  fireEvent.contextMenu(screen.getByText("Example"));
  expect(screen.getByRole("menuitem", { name: "编辑" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "停用" }));
  await waitFor(() => expect(toggle).toHaveBeenCalledWith("example", false));
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
  view.rerender(
    <MemoryRouter>
      <PlatformMenu platform={{ ...platform, is_enabled: false }}>
        <button>Example</button>
      </PlatformMenu>
    </MemoryRouter>,
  );
  fireEvent.contextMenu(screen.getByText("Example"));
  fireEvent.click(screen.getByRole("menuitem", { name: "启用" }));
  await waitFor(() => expect(toggle).toHaveBeenCalledWith("example", true));
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
  fireEvent.contextMenu(screen.getByText("Example"));
  fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: "确认删除" }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith("example"));
  expect(rescan).toHaveBeenCalled();
});
