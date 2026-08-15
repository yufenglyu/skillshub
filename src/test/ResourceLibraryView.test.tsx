import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AgentWithStatus, SkillWithLinks } from "@/types";

const mockLoadResourceLibrary = vi.fn();
const mockInstallSkill = vi.fn();
const mockAddToCentral = vi.fn();
const mockRemoveFromCentral = vi.fn();
const mockUninstallSkillFromAgent = vi.fn();
const mockTogglePlatformLink = vi.fn();
const mockUpdateSourceBackedSkills = vi.fn();
const mockUpdateSourceBackedSkill = vi.fn();
const mockImportSkillsViaNpx = vi.fn();
const mockAddLocalSkills = vi.fn();
const mockCreateManualSkill = vi.fn();
const mockPreviewDeleteResourceBundle = vi.fn();
const mockDeleteResourceBundle = vi.fn();
const mockDeleteResourceSkill = vi.fn();
const mockRefreshCounts = vi.fn();
const mockLoadCentralSkills = vi.fn();
const mockGetSkillsByAgent = vi.fn();
const mockStartTask = vi.fn();
const mockCompleteTask = vi.fn();
const mockFailTask = vi.fn();

const agents: AgentWithStatus[] = [
  {
    id: "cursor",
    display_name: "Cursor",
    category: "coding",
    global_skills_dir: "~/.cursor/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "project:1",
    display_name: "temp",
    category: "project",
    global_skills_dir: "~/Projects/temp/.agents/skills",
    project_skills_dir: ".agents/skills",
    is_detected: true,
    is_builtin: false,
    is_enabled: true,
  },
  {
    id: "hermes",
    display_name: "Hermes",
    category: "coding",
    global_skills_dir: "~/.agents/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
    shares_central_skills: true,
  },
  {
    id: "project:home",
    display_name: "Home",
    category: "project",
    global_skills_dir: "~/.agents/skills/",
    project_skills_dir: ".agents/skills",
    is_detected: true,
    is_builtin: false,
    is_enabled: true,
    shares_central_skills: true,
  },
];

const defaultSkills: SkillWithLinks[] = [
  {
    id: "resource-demo",
    name: "resource-demo",
    description: "Resource demo",
    file_path: "~/.skillshub/library/example/resource-demo/SKILL.md",
    canonical_path: "~/.skillshub/library/example/resource-demo",
    is_central: false,
    scanned_at: "2026-07-14T00:00:00Z",
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T00:00:00Z",
    linked_agents: ["cursor"],
    read_only_agents: [],
  },
];
let resourceSkills: SkillWithLinks[] = defaultSkills;

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/stores/resourceLibraryStore", () => ({
  useResourceLibraryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      skills: resourceSkills,
      agents,
      resourceLibraryDir: "~/.skillshub/library",
      isLoading: false,
      isUpdatingSources: false,
      togglingAgentId: null,
      deletingSkillId: null,
      loadResourceLibrary: mockLoadResourceLibrary,
      installSkill: mockInstallSkill,
      addToCentral: mockAddToCentral,
      removeFromCentral: mockRemoveFromCentral,
      togglePlatformLink: mockTogglePlatformLink,
      updateSourceBackedSkills: mockUpdateSourceBackedSkills,
      updateSourceBackedSkill: mockUpdateSourceBackedSkill,
      importSkillsViaNpx: mockImportSkillsViaNpx,
      addLocalSkills: mockAddLocalSkills,
      createManualSkill: mockCreateManualSkill,
      previewDeleteResourceBundle: mockPreviewDeleteResourceBundle,
      deleteResourceBundle: mockDeleteResourceBundle,
      deleteResourceSkill: mockDeleteResourceSkill,
    }),
}));

vi.mock("@/stores/platformStore", () => ({
  usePlatformStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ refreshCounts: mockRefreshCounts }),
}));

vi.mock("@/stores/centralSkillsStore", () => ({
  useCentralSkillsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ loadCentralSkills: mockLoadCentralSkills }),
}));

vi.mock("@/stores/skillStore", () => ({
  useSkillStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      skillsByAgent: {},
      getSkillsByAgent: mockGetSkillsByAgent,
      uninstallSkillFromAgent: mockUninstallSkillFromAgent,
    }),
}));

vi.mock("@/stores/appStatusStore", () => ({
  useAppStatusStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      startTask: mockStartTask,
      completeTask: mockCompleteTask,
      failTask: mockFailTask,
    }),
}));

import { ResourceLibraryView } from "@/pages/ResourceLibraryView";

describe("ResourceLibraryView delete", () => {
  async function switchBrowserViewMode(mode: "all" | "folders") {
    const name = mode === "folders" ? /^目录$|^Folders$/i : /^平铺$|^Flat$/i;
    fireEvent.click(await screen.findByRole("button", { name }));
  }

  function tableDataRows() {
    return screen
      .getAllByRole("row")
      .filter((row) => within(row).queryAllByRole("cell").length > 0);
  }

  beforeEach(() => {
    resourceSkills = defaultSkills;
    mockLoadResourceLibrary.mockReset();
    mockInstallSkill.mockReset();
    mockAddToCentral.mockReset();
    mockTogglePlatformLink.mockReset();
    mockUpdateSourceBackedSkills.mockReset();
    mockUpdateSourceBackedSkill.mockReset();
    mockImportSkillsViaNpx.mockReset();
    mockAddLocalSkills.mockReset();
    mockCreateManualSkill.mockReset();
    mockPreviewDeleteResourceBundle.mockReset();
    mockPreviewDeleteResourceBundle.mockResolvedValue({
      bundle: {
        name: "example",
        relativePath: "example",
        path: "~/.skillshub/library/example",
        isSymlink: false,
        skillCount: 1,
        linkedAgentCount: 1,
        readOnlyAgentCount: 0,
      },
      skills: resourceSkills,
      affectedAgents: ["cursor"],
      skippedReadOnlyAgents: [],
    });
    mockDeleteResourceBundle.mockReset();
    mockDeleteResourceBundle.mockResolvedValue({
      relativePath: "example",
      removedBundlePath: "~/.skillshub/library/example",
      removedKind: "directory",
      removedSkillIds: ["resource-demo"],
      uninstalledAgents: ["cursor"],
      skippedReadOnlyAgents: [],
    });
    mockDeleteResourceSkill.mockReset();
    mockDeleteResourceSkill.mockResolvedValue({
      skillId: "resource-demo",
      removedCanonicalPath: "~/.skillshub/library/example/resource-demo",
      uninstalledAgents: ["cursor"],
      skippedReadOnlyAgents: [],
    });
    mockRefreshCounts.mockReset();
    mockLoadCentralSkills.mockReset();
    mockGetSkillsByAgent.mockReset();
    mockStartTask.mockReset();
    mockCompleteTask.mockReset();
    mockFailTask.mockReset();
    window.localStorage.removeItem("skills-manage.skillListViewMode.resource-library");
  });

  it("opens a cascade confirmation for installed resource skills", async () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /^删除$|^Delete$/i,
      })
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Cursor/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Uninstall and delete|卸载并删除/i }));

    await waitFor(() => {
      expect(mockDeleteResourceSkill).toHaveBeenCalledWith("resource-demo", {
        cascadeUninstall: true,
      });
    });
    expect(mockRefreshCounts).toHaveBeenCalled();
  });

  it("shows local add after the npx import button", () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    const importButton = screen.getByRole("button", { name: /导入技能|Import skills/i });
    const addButton = screen.getByRole("button", { name: /添加技能|Add skills/i });
    expect(importButton.compareDocumentPosition(addButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders icons for update-from-source and unified import buttons", () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    const updateButton = screen.getByRole("button", { name: /更新技能|Update skills/i });
    const importButton = screen.getByRole("button", { name: /导入技能|Import skills/i });

    expect(updateButton.querySelector("svg")).not.toBeNull();
    expect(importButton.querySelector("svg")).not.toBeNull();
  });

  it("reports source update progress to the app status bar", async () => {
    mockUpdateSourceBackedSkills.mockResolvedValue(["resource-demo", "other-skill"]);

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /更新技能|Update skills/i }));

    expect(mockStartTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "resource-source-update",
        label: "更新技能",
      })
    );

    await waitFor(() => {
      expect(mockCompleteTask).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedCount: 2,
        })
      );
    });
  });

  it("reports the failing skill and reason to the app status bar", async () => {
    mockUpdateSourceBackedSkills.mockRejectedValue(
      new Error("Failed to update ask-matt: Failed to download skill metadata.")
    );

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /更新技能|Update skills/i }));

    await waitFor(() => {
      expect(mockFailTask).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: "Failed to update ask-matt: Failed to download skill metadata.",
          error: "Failed to update ask-matt: Failed to download skill metadata.",
        })
      );
    });
  });

  it("shows per-skill source update for GitHub metadata without a stored URL", () => {
    resourceSkills = [
      {
        ...defaultSkills[0],
        source_repo: "example/skills",
        source_path: "resource-demo/SKILL.md",
        source_url: null,
      },
    ];

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("button", {
        name: /^更新$|^Update$/i,
      })
    ).toBeInTheDocument();
  });

  it("falls back to the github source label when source metadata is partial", () => {
    resourceSkills = [
      {
        ...defaultSkills[0],
        source: "github:example/skills",
        source_repo: null,
        source_author: null,
        source_path: "resource-demo/SKILL.md",
        source_url: null,
      },
    ];

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    expect(screen.getAllByText("example/skills").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", {
        name: /^更新$|^Update$/i,
      })
    ).toBeInTheDocument();
  });

  it("opens the npx import dialog from the import button", () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /导入技能|Import skills/i }));

    const dialog = screen.getByRole("dialog", { name: /导入技能|Import skills/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/GitHub 仓库|GitHub repository/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/技能名称|Skill name/i)).toBeInTheDocument();
    expect(
      within(dialog).getByTitle(/留空时导入仓库中能识别到的全部技能|Leave blank to import every skill/i)
    ).toBeInTheDocument();
  });

  it("sorts resource skills by modified time and direction controls", async () => {
    resourceSkills = [
      {
        ...defaultSkills[0],
        id: "alpha-skill",
        name: "alpha-skill",
        file_path: "~/.skillshub/library/example/alpha-skill/SKILL.md",
        canonical_path: "~/.skillshub/library/example/alpha-skill",
        created_at: "2026-07-10T00:00:00Z",
        updated_at: "2026-07-10T00:00:00Z",
      },
      {
        ...defaultSkills[0],
        id: "zeta-skill",
        name: "zeta-skill",
        file_path: "~/.skillshub/library/example/zeta-skill/SKILL.md",
        canonical_path: "~/.skillshub/library/example/zeta-skill",
        created_at: "2026-07-11T00:00:00Z",
        updated_at: "2026-07-12T00:00:00Z",
      },
    ];

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "更新时间" }));

    await waitFor(() => {
      const rows = tableDataRows();
      expect(rows[0]).toHaveTextContent("alpha-skill");
      expect(rows[1]).toHaveTextContent("zeta-skill");
    });

    fireEvent.click(screen.getByRole("button", { name: "更新时间，升序排序" }));

    await waitFor(() => {
      const rows = tableDataRows();
      expect(rows[0]).toHaveTextContent("zeta-skill");
      expect(rows[1]).toHaveTextContent("alpha-skill");
    });
  });

  it("sorts resource directories by modified time and direction controls", async () => {
    resourceSkills = [
      {
        ...defaultSkills[0],
        id: "old-skill",
        name: "old-skill",
        file_path: "~/.skillshub/library/zeta/repo/old-skill/SKILL.md",
        canonical_path: "~/.skillshub/library/zeta/repo/old-skill",
        created_at: "2026-07-10T00:00:00Z",
        updated_at: "2026-07-10T00:00:00Z",
      },
      {
        ...defaultSkills[0],
        id: "new-skill",
        name: "new-skill",
        file_path: "~/.skillshub/library/alpha/repo/new-skill/SKILL.md",
        canonical_path: "~/.skillshub/library/alpha/repo/new-skill",
        created_at: "2026-07-11T00:00:00Z",
        updated_at: "2026-07-12T00:00:00Z",
      },
    ];

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    await switchBrowserViewMode("folders");
    fireEvent.click(screen.getByRole("button", { name: "更新时间" }));

    await waitFor(() => {
      const rows = tableDataRows();
      expect(rows[0]).toHaveTextContent("zeta/repo");
      expect(rows[1]).toHaveTextContent("alpha/repo");
    });

    fireEvent.click(screen.getByRole("button", { name: "更新时间，升序排序" }));

    await waitFor(() => {
      const rows = tableDataRows();
      expect(rows[0]).toHaveTextContent("alpha/repo");
      expect(rows[1]).toHaveTextContent("zeta/repo");
    });
  });

  it("cycles sort direction from the active sort field without separate direction buttons", async () => {
    resourceSkills = [
      {
        ...defaultSkills[0],
        id: "alpha-skill",
        name: "alpha-skill",
        file_path: "~/.skillshub/library/example/alpha-skill/SKILL.md",
        canonical_path: "~/.skillshub/library/example/alpha-skill",
      },
      {
        ...defaultSkills[0],
        id: "zeta-skill",
        name: "zeta-skill",
        file_path: "~/.skillshub/library/example/zeta-skill/SKILL.md",
        canonical_path: "~/.skillshub/library/example/zeta-skill",
      },
    ];

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    expect(screen.queryByRole("group", { name: "排序方向" })).toBeNull();
    expect(screen.queryByRole("button", { name: "正排" })).toBeNull();
    expect(screen.queryByRole("button", { name: "倒排" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "名称，升序排序" }));

    await waitFor(() => {
      const rows = tableDataRows();
      expect(rows[0]).toHaveTextContent("zeta-skill");
      expect(rows[1]).toHaveTextContent("alpha-skill");
    });
  });

  it("filters resource directories by selected tag in folder view", async () => {
    resourceSkills = [
      {
        ...defaultSkills[0],
        id: "design-skill",
        name: "design-skill",
        tags: ["design"],
        file_path: "~/.skillshub/library/alpha/repo/design-skill/SKILL.md",
        canonical_path: "~/.skillshub/library/alpha/repo/design-skill",
      },
      {
        ...defaultSkills[0],
        id: "backend-skill",
        name: "backend-skill",
        tags: ["backend"],
        file_path: "~/.skillshub/library/zeta/repo/backend-skill/SKILL.md",
        canonical_path: "~/.skillshub/library/zeta/repo/backend-skill",
      },
    ];

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    await switchBrowserViewMode("folders");
    fireEvent.click(screen.getByRole("button", { name: "#design" }));

    await waitFor(() => {
      const rows = tableDataRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent("alpha/repo");
      expect(screen.queryByText("zeta/repo")).toBeNull();
    });
  });

  it("refreshes resource library, central skills, and counts after npx import", async () => {
    mockImportSkillsViaNpx.mockResolvedValue({
      command: "npx skills add mattpocock/skills --yes",
      stagingDir: "~/.skillshub/tmp/npx-import",
      localImport: {
        sourceDir: "~/.skillshub/tmp/npx-import/.agents/skills",
        targetDir: "~/.skillshub/library/mattpocock/skills",
        overwrite: true,
        addedSkills: [],
      },
    });

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );
    mockLoadResourceLibrary.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /导入技能|Import skills/i }));
    const dialog = screen.getByRole("dialog", { name: /导入技能|Import skills/i });
    fireEvent.change(within(dialog).getByLabelText(/GitHub 仓库|GitHub repository/i), {
      target: { value: "mattpocock/skills" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /导入技能|Import skills/i }));

    await waitFor(() => {
      expect(mockLoadResourceLibrary).toHaveBeenCalledTimes(1);
      expect(mockLoadCentralSkills).toHaveBeenCalledTimes(1);
      expect(mockRefreshCounts).toHaveBeenCalledTimes(1);
    });
  });

  it("switches between flat and folder views from the search toolbar", async () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    const searchInput = screen.getByPlaceholderText(/搜索技能资源库|Search resource library/i);
    const organization = screen.getByRole("group", { name: /组织|Organize/i });
    expect(searchInput.closest(".flex.items-center")).toContainElement(organization);

    expect(screen.getByRole("button", { name: /^平铺$|^Flat$/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: /^目录$|^Folders$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^目录$|^Folders$/i })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });
  });

  it("refreshes project directory caches after adding a resource skill to Central Skills", async () => {
    mockAddToCentral.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /^加入中央技能库$|^Add to Central Skills$/i,
      })
    );

    await waitFor(() => {
      expect(mockAddToCentral).toHaveBeenCalledWith("resource-demo");
    });
    expect(mockLoadCentralSkills).toHaveBeenCalled();
    expect(mockRefreshCounts).toHaveBeenCalled();
    expect(mockGetSkillsByAgent).toHaveBeenCalledWith("cursor");
    expect(mockGetSkillsByAgent).toHaveBeenCalledWith("project:1");
  });

  it("removes the central copy while preserving the resource skill", async () => {
    resourceSkills = [
      {
        ...defaultSkills[0],
        is_central: true,
        linked_agents: ["cursor"],
      },
    ];
    mockRemoveFromCentral.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /^从中央技能库移除$|^Remove from Central Skills$/i,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /确认删除|Confirm/i }));

    await waitFor(() => {
      expect(mockRemoveFromCentral).toHaveBeenCalledWith("resource-demo");
    });
    expect(mockLoadCentralSkills).toHaveBeenCalled();
    expect(mockGetSkillsByAgent).toHaveBeenCalledWith("cursor");
  });

  it("previews and confirms deleting a resource directory", async () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    await switchBrowserViewMode("folders");
    const folderRow = await screen.findByRole("row", { name: /example/i });
    fireEvent.click(within(folderRow).getByRole("button", { name: /删除|Delete/i }));

    await waitFor(() => {
      expect(mockPreviewDeleteResourceBundle).toHaveBeenCalledWith("example");
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /删除目录并卸载|Delete directory and uninstall/i }));

    await waitFor(() => {
      expect(mockDeleteResourceBundle).toHaveBeenCalledWith("example", {
        cascadeUninstall: true,
      });
    });
  });

  it("groups folder install targets by software platform and project directory", async () => {
    resourceSkills = defaultSkills.map((skill) => ({ ...skill, linked_agents: [] }));
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    await switchBrowserViewMode("folders");
    const folderRow = await screen.findByRole("row", { name: /example/i });
    fireEvent.click(
      within(folderRow).getByRole("button", {
        name: /安装到平台或项目|Install to platform or project/i,
      })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /安装目录 example|Install folder example/i,
    });

    expect(
      within(dialog).getByRole("heading", { name: /软件平台|Software platforms/i })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: /项目目录|Project directories/i })
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Cursor")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("temp")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Hermes")).toBeEnabled();
    expect(within(dialog).getByLabelText("Home")).toBeEnabled();
    expect(within(dialog).getAllByText("将加入中央技能库")).toHaveLength(2);
    fireEvent.click(within(dialog).getByLabelText("Home"));
    expect(
      within(dialog).getByText(/选中的共享平台会按中央库规则同步/)
    ).toBeInTheDocument();
  });

  it("disables the shared folder install target when every skill is already central", async () => {
    resourceSkills = defaultSkills.map((skill) => ({
      ...skill,
      is_central: true,
      linked_agents: [],
    }));
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    await switchBrowserViewMode("folders");
    const folderRow = await screen.findByRole("row", { name: /example/i });
    fireEvent.click(
      within(folderRow).getByRole("button", {
        name: /安装到平台或项目|Install to platform or project/i,
      })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /安装目录 example|Install folder example/i,
    });
    expect(within(dialog).getByLabelText("Hermes")).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByLabelText("Home")).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getAllByText("已通过中央库共享")).toHaveLength(2);
  });

  it("shows two-line install summary counts for resource skills", () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    expect(screen.getByText("直接安装 1（平台 1 / 项目 0）")).toBeInTheDocument();
    expect(screen.getByText("共享可用 0")).toBeInTheDocument();
  });
});
