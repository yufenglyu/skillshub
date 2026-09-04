import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { PlatformView } from "../pages/PlatformView";
import { AgentWithStatus, ScannedSkill } from "../types";

// Mock stores
vi.mock("../stores/platformStore", () => ({
  usePlatformStore: vi.fn(),
}));

vi.mock("../stores/skillStore", () => ({
  useSkillStore: vi.fn(),
}));

vi.mock("../stores/centralSkillsStore", () => ({
  useCentralSkillsStore: vi.fn(),
}));

vi.mock("../components/skill/SkillDetailDrawer", () => ({
  SkillDetailDrawer: ({
    open,
    skillId,
    agentId,
    rowId,
    onOpenChange,
    returnFocusRef,
  }: {
    open: boolean;
    skillId: string | null;
    agentId?: string | null;
    rowId?: string | null;
    onOpenChange: (open: boolean) => void;
    returnFocusRef?: { current: HTMLElement | null };
  }) =>
    open ? (
      <div data-testid="skill-detail-drawer">
        <div>drawer-skill:{skillId}</div>
        <div>drawer-agent:{agentId ?? "none"}</div>
        <div>drawer-row:{rowId ?? "none"}</div>
        <button
          onClick={() => {
            onOpenChange(false);
            returnFocusRef?.current?.focus();
          }}
        >
          Close drawer
        </button>
      </div>
    ) : null,
}));

import { usePlatformStore } from "../stores/platformStore";
import { useSkillStore } from "../stores/skillStore";
import { useCentralSkillsStore } from "../stores/centralSkillsStore";
import * as tauriBridge from "@/lib/tauri";


// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockAgent: AgentWithStatus = {
  id: "claude-code",
  display_name: "Claude Code",
  global_skills_dir: "/Users/test/.claude/skills/",
  is_detected: true,
  is_builtin: true,
  is_enabled: true,
};

const mockCursorAgent: AgentWithStatus = {
  id: "cursor",
  display_name: "Cursor",
  global_skills_dir: "/Users/test/.cursor/skills/",
  is_detected: true,
  is_builtin: true,
  is_enabled: true,
};

const mockSkills: ScannedSkill[] = [
  {
    id: "frontend-design",
    name: "frontend-design",
    description: "Build distinctive, production-grade frontend interfaces",
    file_path: "~/.claude/skills/frontend-design/SKILL.md",
    dir_path: "~/.claude/skills/frontend-design",
    link_type: "symlink",
    symlink_target: "~/.agents/skills/frontend-design",
    is_central: true,
  },
  {
    id: "code-reviewer",
    name: "code-reviewer",
    description: "Review code changes and identify high-confidence actionable bugs",
    file_path: "~/.claude/skills/code-reviewer/SKILL.md",
    dir_path: "~/.claude/skills/code-reviewer",
    link_type: "copy",
    is_central: false,
  },
  {
    id: "resource-linked-skill",
    name: "resource-linked-skill",
    description: "Installed directly from the skill repository",
    file_path: "~/.claude/skills/resource-linked-skill/SKILL.md",
    dir_path: "~/.claude/skills/resource-linked-skill",
    link_type: "symlink",
    symlink_target: "~/Skills/resource-linked-skill",
    is_central: false,
    source: "resource-library",
  },
];

const mockCursorSkills: ScannedSkill[] = [
  {
    id: "cursor-helper",
    name: "cursor-helper",
    description: "Cursor-specific helper skill",
    file_path: "~/.cursor/skills/cursor-helper/SKILL.md",
    dir_path: "~/.cursor/skills/cursor-helper",
    link_type: "symlink",
    symlink_target: "~/.agents/skills/cursor-helper",
    is_central: true,
  },
];

const mockNestedPlatformSkills: ScannedSkill[] = [
  {
    id: "root-helper",
    name: "root-helper",
    description: "Top-level helper",
    file_path: "/Users/test/.claude/skills/root-helper/SKILL.md",
    dir_path: "/Users/test/.claude/skills/root-helper",
    link_type: "copy",
    is_central: false,
  },
  {
    id: "nested-helper",
    name: "nested-helper",
    description: "Nested helper",
    file_path: "/Users/test/.claude/skills/toolkit/nested-helper/SKILL.md",
    dir_path: "/Users/test/.claude/skills/toolkit/nested-helper",
    link_type: "copy",
    is_central: false,
  },
];

const mockCompatibilityCentralSkills: ScannedSkill[] = [
  {
    id: "algorithmic-art",
    row_id: "amp::compatibility::algorithmic-art",
    name: "algorithmic-art",
    description: "Creating algorithmic art",
    file_path: "/Users/test/.agents/skills/anthropics/algorithmic-art/SKILL.md",
    dir_path: "/Users/test/.agents/skills/anthropics/algorithmic-art",
    link_type: "copy",
    is_central: true,
    source_kind: "compatibility",
    source_root: "/Users/test/.agents/skills",
    is_read_only: true,
  },
  {
    id: "defuddle",
    row_id: "amp::compatibility::defuddle",
    name: "defuddle",
    description: "Extract clean markdown",
    file_path: "/Users/test/.agents/skills/kepano/defuddle/SKILL.md",
    dir_path: "/Users/test/.agents/skills/kepano/defuddle",
    link_type: "copy",
    is_central: true,
    source_kind: "compatibility",
    source_root: "/Users/test/.agents/skills",
    is_read_only: true,
  },
];

const mockDuplicatePlatformSkills: ScannedSkill[] = [
  {
    id: "shared-skill",
    row_id: "claude-code::shared-skill",
    name: "shared-skill",
    description: "Platform copy",
    file_path: "~/.claude/skills/shared-skill/SKILL.md",
    dir_path: "~/.claude/skills/shared-skill",
    link_type: "native",
    is_central: false,
    source_kind: null,
    source_root: null,
    is_read_only: false,
    conflict_count: 2,
  },
  {
    id: "shared-skill",
    row_id: "claude-code::compatibility::shared-skill",
    name: "shared-skill",
    description: "Shared Hub visible copy",
    file_path: "~/.agents/skills/shared-skill/SKILL.md",
    dir_path: "~/.agents/skills/shared-skill",
    link_type: "native",
    is_central: false,
    source_kind: "compatibility",
    source_root: "~/.agents/skills",
    is_read_only: true,
    conflict_count: 2,
  },
];

const mockDuplicatePlatformSkillsWithDistinctIds: ScannedSkill[] = [
  {
    id: "shared-skill-id",
    row_id: "claude-code::shared-skill-id",
    name: "Shared skill",
    description: "Platform copy",
    file_path: "~/.claude/skills/shared-skill/SKILL.md",
    dir_path: "~/.claude/skills/shared-skill",
    link_type: "native",
    is_central: false,
    source_kind: null,
    source_root: null,
    is_read_only: false,
    conflict_count: 2,
  },
  {
    id: "shared-skill-id",
    row_id: "claude-code::compatibility::shared-skill-id",
    name: "Shared skill",
    description: "Shared Hub visible copy",
    file_path: "~/.agents/skills/shared-skill/SKILL.md",
    dir_path: "~/.agents/skills/shared-skill",
    link_type: "native",
    is_central: false,
    source_kind: "compatibility",
    source_root: "~/.agents/skills",
    is_read_only: true,
    conflict_count: 2,
  },
];

const mockGetSkillsByAgent = vi.fn();
const mockLoadCentralSkills = vi.fn();
const mockInstallSkill = vi.fn();
const mockUninstallSkillFromAgent = vi.fn();
const mockRefreshCounts = vi.fn();
const mockUsePlatformStore = vi.mocked(usePlatformStore);
const mockUseSkillStore = vi.mocked(useSkillStore);
const mockUseCentralSkillsStore = vi.mocked(useCentralSkillsStore);

function buildPlatformStoreState(overrides = {}) {
  return {
    agents: [mockAgent],
    skillsByAgent: { "claude-code": 2 },
    isLoading: false,
    isRefreshing: false,
    scanGeneration: 1,
    error: null,
    initialize: vi.fn(),
    rescan: vi.fn(),
    refreshCounts: mockRefreshCounts,
    ...overrides,
  };
}

function buildSkillStoreState(overrides = {}) {
  return {
    skillsByAgent: { "claude-code": mockSkills },
    loadingByAgent: { "claude-code": false },
    pendingSkillActionKeys: {},
    error: null,
    getSkillsByAgent: mockGetSkillsByAgent,
    uninstallSkillFromAgent: mockUninstallSkillFromAgent,
    ...overrides,
  };
}

function buildCentralSkillsStoreState(overrides = {}) {
  return {
    skills: [],
    agents: [mockAgent],
    loadCentralSkills: mockLoadCentralSkills,
    installSkill: mockInstallSkill,
    ...overrides,
  };
}

function installDefaultStoreMocks() {
  mockUsePlatformStore.mockImplementation((selector?: unknown) => {
    const state = buildPlatformStoreState();
    if (typeof selector === "function") return selector(state);
    return state;
  });
  mockUseSkillStore.mockImplementation((selector?: unknown) => {
    const state = buildSkillStoreState();
    if (typeof selector === "function") return selector(state);
    return state;
  });
  mockUseCentralSkillsStore.mockImplementation((selector?: unknown) => {
    const state = buildCentralSkillsStoreState();
    if (typeof selector === "function") return selector(state);
    return state;
  });
}

function renderPlatformView(agentId = "claude-code") {
  return render(
    <MemoryRouter initialEntries={[`/platform/${agentId}`]}>
      <Routes>
        <Route path="/platform/:agentId" element={<PlatformView />} />
      </Routes>
    </MemoryRouter>
  );
}

let testNavigate: ReturnType<typeof useNavigate> | null = null;

function NavigationHarness() {
  testNavigate = useNavigate();
  return null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PlatformView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    testNavigate = null;
    mockRefreshCounts.mockReset();
    mockUninstallSkillFromAgent.mockReset();
    installDefaultStoreMocks();
  });

  // ── Header ────────────────────────────────────────────────────────────────

  it("shows platform name in header", () => {
    renderPlatformView();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  it("shows platform directory path in header", () => {
    renderPlatformView();
    expect(screen.getByText("/Users/test/.claude/skills/")).toBeInTheDocument();
  });

  it("opens the software platform directory from the header path", async () => {
    const invokeSpy = vi.spyOn(tauriBridge, "invoke").mockResolvedValue(undefined);
    renderPlatformView();

    fireEvent.click(
      screen.getByRole("button", {
        name: "在文件管理器中打开: /Users/test/.claude/skills/",
      })
    );

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("open_in_file_manager", {
        path: "/Users/test/.claude/skills/",
      });
    });
    invokeSpy.mockRestore();
  });

  it("opens a project directory path from the header", async () => {
    const projectAgent: AgentWithStatus = {
      id: "project:1",
      display_name: "temp",
      global_skills_dir: "/Users/test/Projects/temp/.agents/skills",
      project_skills_dir: ".agents/skills",
      is_detected: true,
      is_builtin: false,
      is_enabled: true,
    };
    mockUsePlatformStore.mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({
        agents: [projectAgent],
        skillsByAgent: { "project:1": 0 },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "project:1": [] },
        loadingByAgent: { "project:1": false },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    const invokeSpy = vi.spyOn(tauriBridge, "invoke").mockResolvedValue(undefined);
    renderPlatformView(encodeURIComponent("project:1"));

    fireEvent.click(
      screen.getByRole("button", {
        name: "在文件管理器中打开: /Users/test/Projects/temp/.agents/skills",
      })
    );

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("open_in_file_manager", {
        path: "/Users/test/Projects/temp/.agents/skills",
      });
    });
    invokeSpy.mockRestore();
  });

  // ── Skill List ────────────────────────────────────────────────────────────

  it("renders skill cards for all skills", () => {
    renderPlatformView();
    expect(screen.getByText("frontend-design")).toBeInTheDocument();
    expect(screen.getByText("code-reviewer")).toBeInTheDocument();
  });

  it("defaults to all-skills mode for nested platform skills", () => {
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "claude-code": mockNestedPlatformSkills },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    renderPlatformView();

    expect(screen.getByText("nested-helper")).toBeInTheDocument();
    expect(screen.queryByText("toolkit")).not.toBeInTheDocument();
  });

  it("shows only platform folders in folder overview", () => {
    window.localStorage.setItem("skills-manage.skillListViewMode.platform", "folders");
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "claude-code": mockNestedPlatformSkills },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    renderPlatformView();

    expect(screen.getByText("toolkit")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /查看 root-helper 的详情/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /查看 nested-helper 的详情/i })
    ).not.toBeInTheDocument();
  });

  it("groups read-only central compatibility skills by their central source root", () => {
    window.localStorage.setItem("skills-manage.skillListViewMode.platform", "folders");
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "claude-code": mockCompatibilityCentralSkills },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    renderPlatformView();

    expect(screen.getByText("anthropics")).toBeInTheDocument();
    expect(screen.getByText("kepano")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /查看 algorithmic-art 的详情/i })
    ).not.toBeInTheDocument();
  });

  it("switches between all and folders mode from the platform toolbar", () => {
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "claude-code": mockNestedPlatformSkills },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    renderPlatformView();

    expect(screen.getByText("nested-helper")).toBeInTheDocument();
    expect(screen.queryByText("toolkit")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /目录|Folders/i }));

    expect(screen.getByText("toolkit")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /查看 nested-helper 的详情/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^平铺$|^Flat$/i }));

    expect(screen.getByText("nested-helper")).toBeInTheDocument();
  });

  it("shows sortable table headers and view controls", () => {
    renderPlatformView();

    expect(screen.queryByRole("group", { name: "排序方向" })).toBeNull();
    expect(screen.queryByRole("group", { name: "排序字段" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "创建时间" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "更新时间" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "安装统计" })).toBeInTheDocument();
    expect(screen.getAllByText("直接安装 1（平台 1 / 项目 0）").length).toBeGreaterThan(0);
    expect(screen.getAllByText("共享可用 0").length).toBeGreaterThan(0);
    const searchInput = screen.getByPlaceholderText(/搜索技能/);
    const organization = screen.getByRole("group", { name: /组织|Organize/i });
    expect(searchInput.closest(".flex.items-center")).toContainElement(organization);
    expect(screen.getByRole("button", { name: /目录|Folders/i })).toBeInTheDocument();
  });

  it("cycles platform skill sort direction by clicking the active sort field", async () => {
    renderPlatformView();

    fireEvent.click(screen.getByRole("button", { name: "名称，升序排序" }));

    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows[0]).toHaveTextContent("resource-linked-skill");
      expect(rows[1]).toHaveTextContent("frontend-design");
      expect(rows[2]).toHaveTextContent("code-reviewer");
    });
  });

  it("drills into a platform folder with the shared table layout", () => {
    window.localStorage.setItem("skills-manage.skillListViewMode.platform", "folders");
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "claude-code": mockNestedPlatformSkills },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    renderPlatformView();

    fireEvent.click(screen.getByRole("button", { name: "toolkit" }));

    expect(screen.getByRole("button", { name: "返回目录" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /nested-helper/i })).toBeInTheDocument();
    expect(screen.queryByTestId("skill-folder-drawer")).not.toBeInTheDocument();
  });

  it("shows source indicator on skill cards", () => {
    renderPlatformView();
    expect(
      screen.getAllByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "链接到共享中心")
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "本平台副本")
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "链接到仓库")
        .length
    ).toBeGreaterThan(0);
  });

  it("labels a shared Shared Hub symlink as linked from the skill repository", () => {
    const antigravityAgent: AgentWithStatus = {
      id: "antigravity",
      display_name: "Antigravity",
      global_skills_dir: "/Users/test/.agents/skills/",
      is_detected: true,
      is_builtin: true,
      is_enabled: true,
    };
    mockUsePlatformStore.mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({
        agents: [antigravityAgent],
        skillsByAgent: { antigravity: 1 },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: {
          antigravity: [
            {
              id: "promoted-skill",
              name: "promoted-skill",
              description: "Promoted from the skill repository",
              file_path: "~/.agents/skills/promoted-skill/SKILL.md",
              dir_path: "~/.agents/skills/promoted-skill",
              link_type: "symlink",
              symlink_target: "~/.skillshub/library/promoted-skill",
              is_central: true,
              source: "resource-library",
            },
          ],
        },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    renderPlatformView("antigravity");

    expect(
      screen.getAllByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "链接到仓库")
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "文件在共享中心")
    ).not.toBeInTheDocument();
  });

  it("renders browser fixture installed card on the localhost validation surface without Tauri", async () => {
    const isTauriSpy = vi.spyOn(tauriBridge, "isTauriRuntime").mockReturnValue(false);

    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: {
          "claude-code": [
            {
              id: "fixture-central-skill",
              name: "fixture-central-skill",
              description: "Browser fixture skill sourced from the central library",
              file_path: "~/.claude/skills/fixture-central-skill/SKILL.md",
              dir_path: "~/.claude/skills/fixture-central-skill",
              link_type: "symlink",
              symlink_target: "~/.agents/skills/fixture-central-skill",
              is_central: true,
            },
          ],
        },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    render(
      <MemoryRouter initialEntries={["/platform/claude-code"]}>
        <Routes>
          <Route path="/platform/:agentId" element={<PlatformView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: /查看 fixture-central-skill 的详情/i })).toBeInTheDocument();
    expect(
      screen.getAllByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "链接到共享中心")
        .length
    ).toBeGreaterThan(0);

    isTauriSpy.mockRestore();
  });

  // ── Empty State ───────────────────────────────────────────────────────────

  it("shows empty state when platform has no skills", () => {
    mockUsePlatformStore.mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({
        skillsByAgent: { "claude-code": 0 },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "claude-code": [] },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    render(
      <MemoryRouter initialEntries={["/platform/claude-code"]}>
        <Routes>
          <Route path="/platform/:agentId" element={<PlatformView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByText(/该平台暂无技能/)
    ).toBeInTheDocument();
  });

  // ── Platform Not Found ────────────────────────────────────────────────────

  it("shows not found when agent doesn't exist", () => {
    mockUsePlatformStore.mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({ agents: [] });
      if (typeof selector === "function") return selector(state);
      return state;
    });
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({ skillsByAgent: {} });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    render(
      <MemoryRouter initialEntries={["/platform/unknown"]}>
        <Routes>
          <Route path="/platform/:agentId" element={<PlatformView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("未找到平台")).toBeInTheDocument();
  });

  // ── Search / Filter ───────────────────────────────────────────────────────

  it("renders search input", () => {
    renderPlatformView();
    expect(
      screen.getByPlaceholderText(/搜索技能/)
    ).toBeInTheDocument();
  });

  it("filters skills by name when searching", async () => {
    renderPlatformView();
    const searchInput = screen.getByPlaceholderText(/搜索技能/);
    fireEvent.change(searchInput, { target: { value: "frontend" } });

    await waitFor(() => {
      expect(screen.getByText("frontend-design")).toBeInTheDocument();
      expect(screen.queryByText("code-reviewer")).not.toBeInTheDocument();
    });
  });

  it("filters skills by description when searching", async () => {
    renderPlatformView();
    const searchInput = screen.getByPlaceholderText(/搜索技能/);
    fireEvent.change(searchInput, { target: { value: "actionable" } });

    await waitFor(() => {
      expect(screen.getByText("code-reviewer")).toBeInTheDocument();
      expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();
    });
  });

  it("shows all skills when search is cleared", async () => {
    renderPlatformView();
    const searchInput = screen.getByPlaceholderText(/搜索技能/);
    fireEvent.change(searchInput, { target: { value: "frontend" } });
    fireEvent.change(searchInput, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByText("frontend-design")).toBeInTheDocument();
      expect(screen.getByText("code-reviewer")).toBeInTheDocument();
    });
  });

  it("shows empty state message when search has no results", async () => {
    renderPlatformView();
    const searchInput = screen.getByPlaceholderText(/搜索技能/);
    fireEvent.change(searchInput, { target: { value: "nonexistent-skill-xyz" } });

    await waitFor(() => {
      expect(screen.getByText(/没有匹配的技能/)).toBeInTheDocument();
    });
  });

  // ── Data Loading ──────────────────────────────────────────────────────────

  it("calls getSkillsByAgent on mount", () => {
    renderPlatformView();
    expect(mockGetSkillsByAgent).toHaveBeenCalledWith("claude-code");
  });

  it("opens the skill detail drawer without navigating away", async () => {
    renderPlatformView();

    fireEvent.click(screen.getByRole("button", { name: /查看 frontend-design 的详情/i }));

    await waitFor(() => {
      expect(screen.getByTestId("skill-detail-drawer")).toBeInTheDocument();
    });
    expect(screen.getByText("drawer-skill:frontend-design")).toBeInTheDocument();
  });

  it("passes row identity into the drawer when duplicate platform rows share a skill id", async () => {
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "claude-code": mockDuplicatePlatformSkills },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    renderPlatformView();

    const detailButtons = screen.getAllByRole("button", { name: /查看 shared-skill 的详情/i });
    expect(detailButtons).toHaveLength(2);

    fireEvent.click(detailButtons[1]);

    await waitFor(() => {
      expect(screen.getByTestId("skill-detail-drawer")).toBeInTheDocument();
    });

    expect(screen.getByText("drawer-skill:shared-skill")).toBeInTheDocument();
    expect(screen.getByText("drawer-agent:claude-code")).toBeInTheDocument();
    expect(
      screen.getByText("drawer-row:claude-code::compatibility::shared-skill")
    ).toBeInTheDocument();
  });

  it("shows duplicate platform rows with compatibility markers and read-only list treatment", () => {
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "claude-code": mockDuplicatePlatformSkills },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    renderPlatformView();

    expect(screen.getAllByRole("button", { name: /查看 shared-skill 的详情/i })).toHaveLength(2);

    const compatibilityBadge = screen.getByText(/共享中心可见|Seen from Shared Hub/i);

    expect(compatibilityBadge).toBeDefined();
    const pluginCard = compatibilityBadge.closest("tr");
    const userCard = screen
      .getAllByRole("button", { name: /查看 shared-skill 的详情/i })
      .map((button) => button.closest("tr"))
      .find((row) => row !== pluginCard);

    expect(userCard).not.toBeNull();
    expect(pluginCard).not.toBeNull();

    if (!userCard || !pluginCard) {
      return;
    }

    expect(
      within(userCard as HTMLElement).queryByRole("button", {
        name: /将 shared-skill 安装到平台/i,
      })
    ).not.toBeInTheDocument();
    expect(
      within(userCard as HTMLElement).getByRole("button", {
        name: /从平台或项目卸载/i,
      })
    ).toBeInTheDocument();
    expect(
      within(pluginCard as HTMLElement).queryByRole("button", {
        name: /将 shared-skill 安装到平台/i,
      })
    ).not.toBeInTheDocument();
    expect(
      within(pluginCard as HTMLElement).queryByRole("button", {
        name: /从平台或项目卸载/i,
      })
    ).not.toBeInTheDocument();
  });

  it("renders uninstall actions for writable platform skills", () => {
    renderPlatformView();

    const frontendRow = screen.getByRole("row", { name: /frontend-design/i });
    const deleteButton = within(frontendRow).getByRole("button", {
      name: /从平台或项目卸载/i,
    });
    const actionCell = deleteButton.closest("td");
    expect(actionCell).not.toBeNull();
    expect(within(actionCell as HTMLElement).getAllByRole("button")).toHaveLength(1);
    expect(actionCell?.querySelector(".lucide-package-minus")).toBeInTheDocument();
    const codeReviewerRow = screen.getByRole("row", { name: /code-reviewer/i });
    expect(
      within(codeReviewerRow).getByRole("button", { name: /从平台或项目卸载/i })
    ).toBeInTheDocument();
  });

  it("uninstalls a skill from the current platform and refreshes counts", async () => {
    renderPlatformView();

    const frontendRow = screen.getByRole("row", { name: /frontend-design/i });
    fireEvent.click(
      within(frontendRow).getByRole("button", { name: /从平台或项目卸载/i })
    );
    expect(mockUninstallSkillFromAgent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /确认删除/i }));

    await waitFor(() => {
      expect(mockUninstallSkillFromAgent).toHaveBeenCalledWith(
        "frontend-design",
        "claude-code"
      );
    });
    expect(mockRefreshCounts).toHaveBeenCalledTimes(1);
  });

  it("cancels the armed uninstall state when clicking outside the card actions", async () => {
    renderPlatformView();

    const frontendRow = screen.getByRole("row", { name: /frontend-design/i });
    fireEvent.click(
      within(frontendRow).getByRole("button", { name: /从平台或项目卸载/i })
    );
    expect(screen.getByRole("button", { name: /确认删除/i })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /确认删除/i })).not.toBeInTheDocument();
    });
    expect(mockUninstallSkillFromAgent).not.toHaveBeenCalled();
  });

  it("does not offer bulk selection or bulk uninstall on platform and project views", () => {
    renderPlatformView();

    expect(screen.queryByRole("checkbox", { name: /选择 / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /卸载所选/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /全选可见|Select visible/ })).not.toBeInTheDocument();
  });

  it("preserves platform search and scroll state when closing the drawer and restores focus", async () => {
    renderPlatformView();

    const searchInput = screen.getByPlaceholderText(/搜索技能/);
    fireEvent.change(searchInput, { target: { value: "frontend" } });

    const scroller = searchInput.closest(".flex.flex-col.h-full")?.querySelector(".flex-1.overflow-auto.p-6");
    expect(scroller).not.toBeNull();
    if (!scroller) return;
    (scroller as HTMLDivElement).scrollTop = 180;

    const trigger = screen.getByRole("button", { name: /查看 frontend-design 的详情/i });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByTestId("skill-detail-drawer")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /close drawer/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("skill-detail-drawer")).not.toBeInTheDocument();
    });

    expect(searchInput).toHaveValue("frontend");
    expect((scroller as HTMLDivElement).scrollTop).toBe(180);
    expect(trigger).toHaveFocus();
  });

  it("restores focus to the originating duplicate platform row trigger", async () => {
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: { "claude-code": mockDuplicatePlatformSkills },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    renderPlatformView();

    const [userTrigger] = screen.getAllByRole("button", {
      name: /查看 shared-skill 的详情/i,
    });
    fireEvent.click(userTrigger);

    await waitFor(() => {
      expect(screen.getByTestId("skill-detail-drawer")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /close drawer/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("skill-detail-drawer")).not.toBeInTheDocument();
    });

    expect(userTrigger).toHaveFocus();
  });

  it("re-fetches the live platform list after a scan generation change and removes stale duplicate rows without clearing the search query", async () => {
    let platformState = buildPlatformStoreState({
      scanGeneration: 1,
      skillsByAgent: { "claude-code": 2 },
    });
    let skillState = buildSkillStoreState({
      skillsByAgent: { "claude-code": mockDuplicatePlatformSkillsWithDistinctIds },
    });

    mockUsePlatformStore.mockImplementation((selector?: unknown) => {
      if (typeof selector === "function") return selector(platformState);
      return platformState;
    });
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      if (typeof selector === "function") return selector(skillState);
      return skillState;
    });

    const view = renderPlatformView();

    const searchInput = screen.getByPlaceholderText(/搜索技能/);
    fireEvent.change(searchInput, { target: { value: "shared-skill-id" } });

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /查看 Shared skill 的详情/i })
      ).toHaveLength(2);
    });

    mockGetSkillsByAgent.mockClear();

    platformState = buildPlatformStoreState({
      scanGeneration: 2,
      skillsByAgent: { "claude-code": 2 },
    });
    skillState = buildSkillStoreState({
      skillsByAgent: {
        "claude-code": [
          mockDuplicatePlatformSkillsWithDistinctIds[1],
          {
            id: "other-skill",
            name: "Other skill",
            description: "Non-matching survivor",
            file_path: "~/.claude/skills/other-skill/SKILL.md",
            dir_path: "~/.claude/skills/other-skill",
            link_type: "native",
            is_central: false,
            source_kind: null,
            source_root: null,
            is_read_only: false,
          },
        ],
      },
    });

    view.rerender(
      <MemoryRouter initialEntries={["/platform/claude-code"]}>
        <Routes>
          <Route path="/platform/:agentId" element={<PlatformView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGetSkillsByAgent).toHaveBeenCalledWith("claude-code");
    });

    expect(searchInput).toHaveValue("shared-skill-id");
    expect(
      screen.getAllByRole("button", { name: /查看 Shared skill 的详情/i })
    ).toHaveLength(1);
    expect(screen.queryByText("Other skill")).not.toBeInTheDocument();
  });

  it("resets the platform content scroll when navigating to another platform", async () => {
    mockUsePlatformStore.mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({
        agents: [mockAgent, mockCursorAgent],
        skillsByAgent: {
          "claude-code": mockSkills.length,
          cursor: mockCursorSkills.length,
        },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });
    mockUseSkillStore.mockImplementation((selector?: unknown) => {
      const state = buildSkillStoreState({
        skillsByAgent: {
          "claude-code": mockSkills,
          cursor: mockCursorSkills,
        },
        loadingByAgent: {
          "claude-code": false,
          cursor: false,
        },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    render(
      <MemoryRouter initialEntries={["/platform/claude-code"]}>
        <NavigationHarness />
        <Routes>
          <Route path="/platform/:agentId" element={<PlatformView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Claude Code")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/搜索技能/);
    const scroller = searchInput
      .closest(".flex.flex-col.h-full")
      ?.querySelector(".flex-1.overflow-auto.p-6");
    expect(scroller).not.toBeNull();
    if (!scroller) return;

    (scroller as HTMLDivElement).scrollTop = 180;

    await act(async () => {
      testNavigate?.("/platform/cursor");
    });

    await waitFor(() => {
      expect(screen.getByText("Cursor")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect((scroller as HTMLDivElement).scrollTop).toBe(0);
    });
  });
});
