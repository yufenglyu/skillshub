import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { usePlatformStore } from "@/stores/platformStore";
import { useDiscoverStore } from "@/stores/discoverStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import { useThemeStore } from "@/stores/themeStore";

vi.mock("@/stores/platformStore", () => ({
  usePlatformStore: vi.fn(),
}));

vi.mock("@/stores/discoverStore", () => ({
  useDiscoverStore: vi.fn(),
}));

vi.mock("@/stores/resourceLibraryStore", () => ({
  useResourceLibraryStore: vi.fn(),
}));

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(),
}));

const mockCycleMode = vi.fn();

function setupMocks(mode: "system" | "light" | "dark" = "system") {
  vi.mocked(usePlatformStore).mockImplementation((selector?: unknown) => {
    const state = { agents: [], skillsByAgent: {} };
    if (typeof selector === "function") return selector(state);
    return state;
  });
  vi.mocked(useDiscoverStore).mockImplementation((selector?: unknown) => {
    const state = { totalSkillsFound: 0, isScanning: false };
    if (typeof selector === "function") return selector(state);
    return state;
  });
  vi.mocked(useResourceLibraryStore).mockImplementation((selector?: unknown) => {
    const state = { skills: [] };
    if (typeof selector === "function") return selector(state);
    return state;
  });
  vi.mocked(useThemeStore).mockImplementation((selector?: unknown) => {
    const state = { mode, resolvedTheme: mode === "light" ? "light" : "dark", cycleMode: mockCycleMode };
    if (typeof selector === "function") return selector(state);
    return state;
  });
}

describe("TopBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("renders a theme cycle button next to settings", () => {
    render(
      <MemoryRouter initialEntries={["/resources"]}>
        <TopBar onSearchClick={vi.fn()} />
      </MemoryRouter>
    );

    const themeButton = screen.getByRole("button", { name: /切换主题|Cycle theme/i });
    const settingsButton = screen.getByRole("button", { name: /设置|Settings/i });

    expect(themeButton.compareDocumentPosition(settingsButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("cycles theme mode when clicked", () => {
    render(
      <MemoryRouter initialEntries={["/resources"]}>
        <TopBar onSearchClick={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /切换主题|Cycle theme/i }));

    expect(mockCycleMode).toHaveBeenCalledTimes(1);
  });
});
