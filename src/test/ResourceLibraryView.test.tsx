import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AgentWithStatus, SkillWithLinks } from "@/types";

const mockLoadResourceLibrary = vi.fn();
const mockInstallSkill = vi.fn();
const mockAddToCentral = vi.fn();
const mockTogglePlatformLink = vi.fn();
const mockUpdateSourceBackedSkills = vi.fn();
const mockUpdateSourceBackedSkill = vi.fn();
const mockCreateManualSkill = vi.fn();
const mockPreviewDeleteResourceBundle = vi.fn();
const mockDeleteResourceBundle = vi.fn();
const mockDeleteResourceSkill = vi.fn();
const mockRefreshCounts = vi.fn();
const mockLoadCentralSkills = vi.fn();
const mockGetSkillsByAgent = vi.fn();

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
      togglePlatformLink: mockTogglePlatformLink,
      updateSourceBackedSkills: mockUpdateSourceBackedSkills,
      updateSourceBackedSkill: mockUpdateSourceBackedSkill,
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
    selector({ skillsByAgent: {}, getSkillsByAgent: mockGetSkillsByAgent }),
}));

vi.mock("@/stores/marketplaceStore", () => ({
  useMarketplaceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      githubImport: {
        isPreviewLoading: false,
        isImporting: false,
        preview: null,
        importResult: null,
        previewedRepoUrl: null,
        error: null,
      },
      previewGitHubRepoImport: vi.fn(),
      importGitHubRepoSkills: vi.fn(),
      resetGitHubImport: vi.fn(),
    }),
}));

import { ResourceLibraryView } from "@/pages/ResourceLibraryView";

describe("ResourceLibraryView delete", () => {
  beforeEach(() => {
    resourceSkills = defaultSkills;
    mockLoadResourceLibrary.mockReset();
    mockInstallSkill.mockReset();
    mockAddToCentral.mockReset();
    mockTogglePlatformLink.mockReset();
    mockUpdateSourceBackedSkills.mockReset();
    mockUpdateSourceBackedSkill.mockReset();
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
  });

  it("opens a cascade confirmation for installed resource skills", async () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Delete resource-demo from Skill Resource Library|从技能资源库删除 resource-demo/i,
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

  it("shows manual create after the GitHub import button", () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    const githubImport = screen.getByRole("button", { name: /从 GitHub 导入|Import from GitHub/i });
    const manualCreate = screen.getByRole("button", { name: /手动创建|Manual Create/i });
    expect(githubImport.compareDocumentPosition(manualCreate)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders icons for update-from-source and GitHub import buttons", () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    const updateButton = screen.getByRole("button", { name: /从来源更新|Update from sources/i });
    const githubButton = screen.getByRole("button", { name: /从 GitHub 导入|Import from GitHub/i });

    expect(updateButton.querySelector("svg")).not.toBeNull();
    expect(githubButton.querySelector("svg")).not.toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: "修改时间" }));

    await waitFor(() => {
      const detailButtons = screen.getAllByRole("button", {
        name: /查看 .* 的详情/i,
      });
      expect(detailButtons[0]).toHaveTextContent("alpha-skill");
      expect(detailButtons[1]).toHaveTextContent("zeta-skill");
    });

    fireEvent.click(screen.getByRole("button", { name: "倒排" }));

    await waitFor(() => {
      const detailButtons = screen.getAllByRole("button", {
        name: /查看 .* 的详情/i,
      });
      expect(detailButtons[0]).toHaveTextContent("zeta-skill");
      expect(detailButtons[1]).toHaveTextContent("alpha-skill");
    });
  });

  it("previews and confirms deleting a resource directory", async () => {
    render(
      <MemoryRouter>
        <ResourceLibraryView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /目录|Folders/i }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /删除资源库目录 example|Delete resource directory example/i,
      })
    );

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
});
