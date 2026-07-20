import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SettingsView } from "../pages/SettingsView";
import { ScanDirectory, AgentWithStatus } from "../types";
import { invoke } from "@tauri-apps/api/core";

// Mock stores
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: vi.fn(),
}));

vi.mock("../stores/platformStore", () => ({
  usePlatformStore: vi.fn(),
}));

vi.mock("../stores/centralSkillsStore", () => ({
  useCentralSkillsStore: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useSettingsStore } from "../stores/settingsStore";
import { usePlatformStore } from "../stores/platformStore";
import { useCentralSkillsStore } from "../stores/centralSkillsStore";
import { toast } from "sonner";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockBuiltinDir: ScanDirectory = {
  id: 1,
  path: "/Users/test/.agents/skills/",
  label: "Central Skills",
  is_active: true,
  is_builtin: true,
  added_at: "2026-01-01T00:00:00Z",
};

const mockCustomDir: ScanDirectory = {
  id: 2,
  path: "/Users/test/projects/my-project",
  label: "My Project",
  is_active: true,
  is_builtin: false,
  added_at: "2026-01-02T00:00:00Z",
};

const mockCustomAgent: AgentWithStatus = {
  id: "custom-qclaw",
  display_name: "QClaw",
  category: "other",
  global_skills_dir: "/Users/test/.qclaw/skills/",
  is_detected: false,
  is_builtin: false,
  is_enabled: true,
};

const mockBuiltinAgent: AgentWithStatus = {
  id: "claude-code",
  display_name: "Claude Code",
  category: "coding",
  global_skills_dir: "/Users/test/.claude/skills/",
  is_detected: true,
  is_builtin: true,
  is_enabled: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupMocks({
  scanDirs = [] as ScanDirectory[],
  isLoadingScanDirs = false,
  agents = [] as AgentWithStatus[],
  loadScanDirectories = vi.fn(),
  addScanDirectory = vi.fn(),
  removeScanDirectory = vi.fn(),
  toggleScanDirectory = vi.fn(),
  addCustomAgent = vi.fn(),
  updateCustomAgent = vi.fn(),
  removeCustomAgent = vi.fn(),
  githubPat = "",
  isLoadingGitHubPat = false,
  isSavingGitHubPat = false,
  resourceLibraryDir = "~/.skillshub/library",
  isLoadingResourceLibraryDir = false,
  loadGitHubPat = vi.fn(),
  saveGitHubPat = vi.fn(),
  clearGitHubPat = vi.fn(),
  updateCentralSkillsDir = vi.fn(),
  loadResourceLibraryDir = vi.fn(),
  updateResourceLibraryDir = vi.fn(),
  exportAppBackup = vi.fn(),
  importAppBackup = vi.fn(),
  listWebDavBackups = vi.fn(),
  uploadWebDavBackup = vi.fn(),
  downloadWebDavBackup = vi.fn(),
  webDavConfig = {
    baseUrl: "",
    username: "",
    password: "",
    remoteDir: "skillshub",
  },
  isLoadingWebDavConfig = false,
  isSavingWebDavConfig = false,
  loadWebDavConfig = vi.fn(),
  saveWebDavConfig = vi.fn(),
  loadCentralSkills = vi.fn(),
  rescan = vi.fn(),
  refreshCounts = vi.fn(),
} = {}) {
  vi.mocked(useSettingsStore).mockImplementation((selector) =>
    selector({
      scanDirectories: scanDirs,
      isLoadingScanDirs,
      error: null,
      loadScanDirectories,
      addScanDirectory,
      removeScanDirectory,
      toggleScanDirectory,
      addCustomAgent,
      updateCustomAgent,
      removeCustomAgent,
      githubPat,
      isLoadingGitHubPat,
      isSavingGitHubPat,
      resourceLibraryDir,
      isLoadingResourceLibraryDir,
      loadGitHubPat,
      saveGitHubPat,
      clearGitHubPat,
      updateCentralSkillsDir,
      loadResourceLibraryDir,
      updateResourceLibraryDir,
      exportAppBackup,
      importAppBackup,
      listWebDavBackups,
      uploadWebDavBackup,
      downloadWebDavBackup,
      webDavConfig,
      isLoadingWebDavConfig,
      isSavingWebDavConfig,
      loadWebDavConfig,
      saveWebDavConfig,
      clearError: vi.fn(),
    })
  );

  vi.mocked(usePlatformStore).mockImplementation((selector) =>
    selector({
      agents,
      skillsByAgent: {},
      isLoading: false,
      isRefreshing: false,
      error: null,
      initialize: vi.fn(),
      rescan,
      refreshCounts,
    })
  );

  vi.mocked(useCentralSkillsStore).mockImplementation((selector) =>
    selector({
      loadCentralSkills,
    } as never)
  );
}

function renderSettingsView() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<SettingsView />} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(null);
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it("renders the settings header", () => {
    setupMocks();
    renderSettingsView();
    expect(screen.getByRole("heading", { name: "设置" })).toBeTruthy();
  });

  it("renders the github token section", () => {
    setupMocks();
    renderSettingsView();
    expect(screen.getByText("GitHub 导入访问令牌")).toBeTruthy();
  });

  it("renders the existing settings sections", () => {
    setupMocks();
    renderSettingsView();
    expect(screen.getByRole("heading", { name: "平台与项目目录" })).toBeTruthy();
    expect(screen.getByText("项目目录")).toBeTruthy();
    expect(screen.getByText("软件平台")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "扫描目录" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "自定义平台" })).toBeNull();
    expect(screen.getByText("关于")).toBeTruthy();
  });

  it("groups directory settings in resource, central, software platform order", () => {
    setupMocks();
    renderSettingsView();

    const resource = screen.getByText("技能资源库目录");
    const central = screen.getByText("中央技能库目录");
    const skillLocation = screen.getByRole("heading", { name: "平台与项目目录" });

    expect(resource.compareDocumentPosition(central) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(central.compareDocumentPosition(skillLocation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("calls loadScanDirectories on mount", () => {
    const loadScanDirectories = vi.fn();
    setupMocks({ loadScanDirectories });
    renderSettingsView();
    expect(loadScanDirectories).toHaveBeenCalled();
  });

  it("calls loadGitHubPat on mount", () => {
    const loadGitHubPat = vi.fn();
    setupMocks({ loadGitHubPat });
    renderSettingsView();
    expect(loadGitHubPat).toHaveBeenCalled();
  });

  it("calls loadWebDavConfig on mount", () => {
    const loadWebDavConfig = vi.fn();
    setupMocks({ loadWebDavConfig });
    renderSettingsView();
    expect(loadWebDavConfig).toHaveBeenCalled();
  });

  it("does not render backup content selectors because backups are always complete", () => {
    setupMocks();
    renderSettingsView();

    expect(screen.queryByText("备份内容")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "技能资源库" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "中央技能库" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "软件配置" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "技能安装的平台" })).toBeNull();
  });

  it("uses the localized WebDAV URL placeholder", () => {
    setupMocks();
    renderSettingsView();

    expect(screen.getByPlaceholderText("例如 https://dav.example.com/backups")).toBeTruthy();
  });

  it("renders persisted WebDAV connection settings", () => {
    setupMocks({
      webDavConfig: {
        baseUrl: "https://example.com/dav",
        username: "saved-user",
        password: "saved-secret",
        remoteDir: "saved-dir",
      },
    });
    renderSettingsView();

    expect(screen.getByLabelText("WebDAV URL")).toHaveValue("https://example.com/dav");
    expect(screen.getByLabelText("用户名")).toHaveValue("saved-user");
    expect(screen.getByLabelText("密码或 Token")).toHaveValue("saved-secret");
    expect(screen.getByLabelText("远端目录")).toHaveValue("saved-dir");
  });

  it("saves WebDAV connection settings from the form", async () => {
    const saveWebDavConfig = vi.fn().mockResolvedValue(undefined);
    setupMocks({ saveWebDavConfig });
    renderSettingsView();

    fireEvent.change(screen.getByLabelText("WebDAV URL"), {
      target: { value: "https://example.com/dav" },
    });
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "saved-user" },
    });
    fireEvent.change(screen.getByLabelText("密码或 Token"), {
      target: { value: "saved-secret" },
    });
    fireEvent.change(screen.getByLabelText("远端目录"), {
      target: { value: "saved-dir" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存 WebDAV 配置" }));

    await waitFor(() => {
      expect(saveWebDavConfig).toHaveBeenCalledWith({
        baseUrl: "https://example.com/dav",
        username: "saved-user",
        password: "saved-secret",
        remoteDir: "saved-dir",
      });
    });
  });

  it("local export always includes all backup content", async () => {
    const exportAppBackup = vi.fn().mockResolvedValue(new Uint8Array([80, 75, 3, 4]));
    setupMocks({ exportAppBackup });
    renderSettingsView();

    fireEvent.click(screen.getByRole("button", { name: "导出备份" }));

    await waitFor(() => {
      expect(exportAppBackup).toHaveBeenCalledWith({
        includeResourceLibrary: true,
        includeCentralLibrary: true,
        includeAppConfig: true,
        includeInstallations: true,
      });
    });
  });

  it("refreshes and renders WebDAV backup files", async () => {
    const listWebDavBackups = vi.fn().mockResolvedValue([
      {
        name: "skillshub-backup-2026-07-15-120000.zip",
        remotePath: "skillshub-backup-2026-07-15-120000.zip",
        size: 42,
        modifiedAt: "2026-07-15T12:00:00Z",
      },
    ]);
    setupMocks({ listWebDavBackups });
    renderSettingsView();

    fireEvent.change(screen.getByLabelText("WebDAV URL"), {
      target: { value: "https://example.com/dav" },
    });
    fireEvent.change(screen.getByLabelText("远端目录"), {
      target: { value: "skillshub" },
    });
    fireEvent.click(screen.getByRole("button", { name: "刷新远端备份" }));

    expect(await screen.findByText("skillshub-backup-2026-07-15-120000.zip")).toBeTruthy();
  });

  it("clears stale WebDAV selections when the connection config changes", async () => {
    const listWebDavBackups = vi.fn().mockResolvedValue([
      {
        name: "skillshub-backup-2026-07-15-120000.zip",
        remotePath: "skillshub-backup-2026-07-15-120000.zip",
      },
    ]);
    setupMocks({ listWebDavBackups });
    renderSettingsView();

    fireEvent.change(screen.getByLabelText("WebDAV URL"), {
      target: { value: "https://example.com/dav" },
    });
    fireEvent.change(screen.getByLabelText("远端目录"), {
      target: { value: "skillshub" },
    });
    fireEvent.click(screen.getByRole("button", { name: "刷新远端备份" }));

    expect(await screen.findByText("skillshub-backup-2026-07-15-120000.zip")).toBeTruthy();
    expect(screen.getByRole("button", { name: "导入选中的 WebDAV 备份" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("WebDAV URL"), {
      target: { value: "https://other.example.com/dav" },
    });

    await waitFor(() => {
      expect(screen.queryByText("skillshub-backup-2026-07-15-120000.zip")).toBeNull();
      expect(screen.getByRole("button", { name: "导入选中的 WebDAV 备份" })).toBeDisabled();
    });
  });

  it("disables all backup actions while a local export is running", async () => {
    let resolveExport: (value: Uint8Array) => void = () => undefined;
    const exportAppBackup = vi.fn(
      () =>
        new Promise<Uint8Array>((resolve) => {
          resolveExport = resolve;
        })
    );
    setupMocks({ exportAppBackup });
    renderSettingsView();

    fireEvent.click(screen.getByRole("button", { name: "导出备份" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "导出备份" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "导入备份" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "刷新远端备份" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "上传到 WebDAV" })).toBeDisabled();
    });

    resolveExport(new Uint8Array([80, 75, 3, 4]));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "导出备份" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "刷新远端备份" })).toBeEnabled();
    });
  });

  it("uploads a WebDAV backup then refreshes the remote list", async () => {
    const listWebDavBackups = vi.fn().mockResolvedValue([]);
    const uploadWebDavBackup = vi.fn().mockResolvedValue({
      name: "skillshub-backup.zip",
      remotePath: "skillshub-backup.zip",
    });
    setupMocks({ listWebDavBackups, uploadWebDavBackup });
    renderSettingsView();

    fireEvent.change(screen.getByLabelText("WebDAV URL"), {
      target: { value: "https://example.com/dav" },
    });
    fireEvent.change(screen.getByLabelText("远端目录"), {
      target: { value: "skillshub" },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传到 WebDAV" }));

    await waitFor(() => {
      expect(uploadWebDavBackup).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://example.com/dav",
          remoteDir: "skillshub",
        }),
        {
          includeResourceLibrary: true,
          includeCentralLibrary: true,
          includeAppConfig: true,
          includeInstallations: true,
        }
      );
    });
    expect(listWebDavBackups).toHaveBeenCalled();
  });

  it("shows a distinct localized error when refresh fails after upload", async () => {
    const listWebDavBackups = vi.fn().mockRejectedValue("WebDAV list failed: connection failed");
    const uploadWebDavBackup = vi.fn().mockResolvedValue({
      name: "skillshub-backup.zip",
      remotePath: "skillshub-backup.zip",
    });
    setupMocks({ listWebDavBackups, uploadWebDavBackup });
    renderSettingsView();

    fireEvent.change(screen.getByLabelText("WebDAV URL"), {
      target: { value: "https://example.com/dav" },
    });
    fireEvent.change(screen.getByLabelText("远端目录"), {
      target: { value: "skillshub" },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传到 WebDAV" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("备份已上传到 WebDAV");
      expect(toast.error).toHaveBeenCalledWith("上传成功，但刷新远端备份列表失败: 网络连接失败");
    });
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("上传 WebDAV 备份失败"));
  });

  it("localizes WebDAV backend errors without exposing raw details", async () => {
    const rawError = "WebDAV list failed: internal transport detail 12345";
    const listWebDavBackups = vi.fn().mockRejectedValue(rawError);
    setupMocks({ listWebDavBackups });
    renderSettingsView();

    fireEvent.change(screen.getByLabelText("WebDAV URL"), {
      target: { value: "https://example.com/dav" },
    });
    fireEvent.change(screen.getByLabelText("远端目录"), {
      target: { value: "skillshub" },
    });
    fireEvent.click(screen.getByRole("button", { name: "刷新远端备份" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("刷新远端备份失败: 远端服务请求失败");
    });
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining(rawError));
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("12345"));
  });

  it("imports the selected WebDAV backup", async () => {
    const downloadedBackup = new Uint8Array([80, 75, 3, 4]);
    const downloadWebDavBackup = vi.fn().mockResolvedValue(downloadedBackup);
    const importAppBackup = vi.fn().mockResolvedValue(undefined);
    setupMocks({
      downloadWebDavBackup,
      importAppBackup,
      listWebDavBackups: vi.fn().mockResolvedValue([
        {
          name: "skillshub-backup.zip",
          remotePath: "skillshub-backup.zip",
        },
      ]),
    });
    renderSettingsView();

    fireEvent.change(screen.getByLabelText("WebDAV URL"), {
      target: { value: "https://example.com/dav" },
    });
    fireEvent.change(screen.getByLabelText("远端目录"), {
      target: { value: "skillshub" },
    });
    fireEvent.click(screen.getByRole("button", { name: "刷新远端备份" }));
    await screen.findByText("skillshub-backup.zip");
    fireEvent.click(screen.getByRole("radio", { name: /skillshub-backup\.zip/ }));
    fireEvent.click(screen.getByRole("button", { name: "导入选中的 WebDAV 备份" }));

    await waitFor(() => {
      expect(downloadWebDavBackup).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: "https://example.com/dav", remoteDir: "skillshub" }),
        "skillshub-backup.zip"
      );
    });
    expect(importAppBackup).toHaveBeenCalledWith(downloadedBackup);
  });

  it("renders the saved github pat value and explanation copy", () => {
    setupMocks({ githubPat: "github_pat_saved" });
    renderSettingsView();

    expect(screen.getByLabelText("GitHub Personal Access Token")).toHaveValue("github_pat_saved");
    expect(screen.getByText(/它绝不会被发送到公共镜像或代理回退链路/)).toBeTruthy();
    expect(screen.getByText(/当 GitHub 预览\/导入遇到限流/)).toBeTruthy();
  });

  it("saves the github pat from settings", async () => {
    const saveGitHubPat = vi.fn().mockResolvedValue(undefined);
    setupMocks({ githubPat: "", saveGitHubPat });
    renderSettingsView();

    fireEvent.change(screen.getByLabelText("GitHub Personal Access Token"), {
      target: { value: "  github_pat_new  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(saveGitHubPat).toHaveBeenCalledWith("  github_pat_new  ");
    });
    expect(await screen.findByText("GitHub 令牌已保存")).toBeTruthy();
  });

  it("clears the github pat from settings", async () => {
    const clearGitHubPat = vi.fn().mockResolvedValue(undefined);
    setupMocks({ githubPat: "github_pat_saved", clearGitHubPat });
    renderSettingsView();

    fireEvent.click(screen.getByRole("button", { name: "清除令牌" }));

    await waitFor(() => {
      expect(clearGitHubPat).toHaveBeenCalled();
    });
    expect(await screen.findByText("GitHub 令牌已清除")).toBeTruthy();
  });

  // ── Scan Directories section ──────────────────────────────────────────────

  it("shows loading state for scan directories", () => {
    setupMocks({ isLoadingScanDirs: true });
    renderSettingsView();
    expect(screen.getByText("加载中...")).toBeTruthy();
  });

  it("shows empty state when no scan directories", () => {
    setupMocks({ scanDirs: [] });
    renderSettingsView();
    expect(screen.getByText("暂无项目目录")).toBeTruthy();
  });

  it("does not render builtin scan directories as project directories", () => {
    setupMocks({ scanDirs: [mockBuiltinDir] });
    renderSettingsView();
    expect(screen.queryByText(/内置目录/)).toBeNull();
    expect(screen.queryByText("/Users/test/.agents/skills/")).toBeNull();
    expect(screen.getByText("暂无项目目录")).toBeTruthy();
  });

  it("does not show remove button for builtin directories", () => {
    setupMocks({ scanDirs: [mockBuiltinDir] });
    renderSettingsView();
    // No delete button should be present for builtin dir
    expect(
      screen.queryByRole("button", { name: /删除目录 ~\/.agents\/skills\// })
    ).toBeNull();
  });

  it("shows remove button for custom directories", () => {
    setupMocks({ scanDirs: [mockCustomDir] });
    renderSettingsView();
    expect(
      screen.getByRole("button", { name: `删除目录 ${mockCustomDir.path}` })
    ).toBeTruthy();
  });

  it("shows toggle for custom directories", () => {
    setupMocks({ scanDirs: [mockCustomDir] });
    renderSettingsView();
    expect(screen.getByRole("switch")).toBeTruthy();
  });

  it("does not show toggle for builtin directories", () => {
    setupMocks({ scanDirs: [mockBuiltinDir] });
    renderSettingsView();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows 启用 label when directory is active", () => {
    setupMocks({ scanDirs: [{ ...mockCustomDir, is_active: true }] });
    renderSettingsView();
    expect(screen.getByText("启用")).toBeTruthy();
  });

  it("shows 禁用 label when directory is inactive", () => {
    setupMocks({ scanDirs: [{ ...mockCustomDir, is_active: false }] });
    renderSettingsView();
    expect(screen.getByText("禁用")).toBeTruthy();
  });

  it("shows add directory button", () => {
    setupMocks();
    renderSettingsView();
    expect(screen.getByRole("button", { name: "添加项目目录" })).toBeTruthy();
  });

  it("places add actions beside their matching project directory and software platform sections", () => {
    setupMocks();
    renderSettingsView();

    const projectHeading = screen.getByText("项目目录").closest("[data-testid='settings-project-directories-header']");
    const platformHeading = screen.getByText("软件平台").closest("[data-testid='settings-software-platforms-header']");

    expect(projectHeading).toBeTruthy();
    expect(platformHeading).toBeTruthy();
    expect(projectHeading).toContainElement(screen.getByRole("button", { name: "添加项目目录" }));
    expect(platformHeading).toContainElement(screen.getByRole("button", { name: "添加自定义平台" }));
  });

  it("opens add directory dialog when button is clicked", async () => {
    setupMocks();
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "添加项目目录" }));
    await waitFor(() => {
      expect(screen.getByText("添加项目目录")).toBeTruthy();
    });
  });

  it("removes a custom directory after inline confirmation", async () => {
    const removeScanDirectory = vi.fn().mockResolvedValue(undefined);
    const rescan = vi.fn().mockResolvedValue(undefined);
    setupMocks({
      scanDirs: [mockCustomDir],
      removeScanDirectory,
      rescan,
    });
    renderSettingsView();

    fireEvent.click(
      screen.getByRole("button", { name: `删除目录 ${mockCustomDir.path}` })
    );
    expect(removeScanDirectory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(removeScanDirectory).toHaveBeenCalledWith(mockCustomDir.path);
    });
  });

  it("refreshes counts after removing a directory", async () => {
    const removeScanDirectory = vi.fn().mockResolvedValue(undefined);
    const refreshCounts = vi.fn().mockResolvedValue(undefined);
    setupMocks({ scanDirs: [mockCustomDir], removeScanDirectory, refreshCounts });
    renderSettingsView();

    fireEvent.click(
      screen.getByRole("button", { name: `删除目录 ${mockCustomDir.path}` })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(refreshCounts).toHaveBeenCalled();
    });
  });

  // ── Custom Platforms section ──────────────────────────────────────────────

  it("shows empty state when no software platforms", () => {
    setupMocks({ agents: [] });
    renderSettingsView();
    expect(screen.getByText("暂无软件平台。点击「添加平台」注册自定义平台。")).toBeTruthy();
  });

  it("renders builtin platform with a view action and no edit or remove actions", () => {
    setupMocks({ agents: [mockBuiltinAgent] });
    renderSettingsView();

    expect(screen.getByText("Claude Code")).toBeTruthy();
    expect(screen.getByRole("button", { name: `查看平台 ${mockBuiltinAgent.display_name}` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: `编辑平台 ${mockBuiltinAgent.display_name}` })).toBeNull();
    expect(screen.queryByRole("button", { name: `删除平台 ${mockBuiltinAgent.display_name}` })).toBeNull();
  });

  it("renders custom platform with name and path", () => {
    setupMocks({ agents: [mockBuiltinAgent, mockCustomAgent] });
    renderSettingsView();
    expect(screen.getByText("QClaw")).toBeTruthy();
    expect(screen.getByText("/Users/test/.qclaw/skills/")).toBeTruthy();
  });

  it("shows edit button for custom platforms", () => {
    setupMocks({ agents: [mockBuiltinAgent, mockCustomAgent] });
    renderSettingsView();
    expect(
      screen.getByRole("button", { name: `编辑平台 ${mockCustomAgent.display_name}` })
    ).toBeTruthy();
  });

  it("shows remove button for custom platforms", () => {
    setupMocks({ agents: [mockBuiltinAgent, mockCustomAgent] });
    renderSettingsView();
    expect(
      screen.getByRole("button", { name: `删除平台 ${mockCustomAgent.display_name}` })
    ).toBeTruthy();
  });

  it("shows builtin agents in the software platforms list", () => {
    setupMocks({ agents: [mockBuiltinAgent] });
    renderSettingsView();
    expect(screen.getByText(mockBuiltinAgent.display_name)).toBeTruthy();
  });

  it("shows add platform button", () => {
    setupMocks();
    renderSettingsView();
    expect(screen.getByRole("button", { name: "添加自定义平台" })).toBeTruthy();
  });

  it("opens add platform dialog when button is clicked", async () => {
    setupMocks();
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "添加自定义平台" }));
    await waitFor(() => {
      expect(screen.getByText("添加自定义平台")).toBeTruthy();
    });
  });

  it("opens edit platform dialog when edit button is clicked", async () => {
    setupMocks({ agents: [mockBuiltinAgent, mockCustomAgent] });
    renderSettingsView();
    fireEvent.click(
      screen.getByRole("button", { name: `编辑平台 ${mockCustomAgent.display_name}` })
    );
    await waitFor(() => {
      expect(screen.getByText("编辑自定义平台")).toBeTruthy();
    });
  });

  it("opens readonly platform dialog when builtin view button is clicked", async () => {
    setupMocks({ agents: [mockBuiltinAgent] });
    renderSettingsView();
    fireEvent.click(
      screen.getByRole("button", { name: `查看平台 ${mockBuiltinAgent.display_name}` })
    );
    await waitFor(() => {
      expect(screen.getByText("查看内置平台")).toBeTruthy();
      expect(screen.getByLabelText("平台名称 *")).toBeDisabled();
      expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    });
  });

  it("removes a custom platform after inline confirmation", async () => {
    const removeCustomAgent = vi.fn().mockResolvedValue(undefined);
    const rescan = vi.fn().mockResolvedValue(undefined);
    setupMocks({
      agents: [mockBuiltinAgent, mockCustomAgent],
      removeCustomAgent,
      rescan,
    });
    renderSettingsView();

    fireEvent.click(
      screen.getByRole("button", { name: `删除平台 ${mockCustomAgent.display_name}` })
    );
    expect(removeCustomAgent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(removeCustomAgent).toHaveBeenCalledWith(mockCustomAgent.id);
    });
  });

  it("triggers rescan after removing a platform", async () => {
    const removeCustomAgent = vi.fn().mockResolvedValue(undefined);
    const rescan = vi.fn().mockResolvedValue(undefined);
    setupMocks({
      agents: [mockBuiltinAgent, mockCustomAgent],
      removeCustomAgent,
      rescan,
    });
    renderSettingsView();

    fireEvent.click(
      screen.getByRole("button", { name: `删除平台 ${mockCustomAgent.display_name}` })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(rescan).toHaveBeenCalled();
    });
  });

  // ── About section ─────────────────────────────────────────────────────────

  it("shows the app version in the about section", () => {
    setupMocks();
    renderSettingsView();
    expect(screen.getByText("SkillsHub v0.12.0")).toBeTruthy();
  });

  it("shows the database path in the about section", () => {
    setupMocks({ scanDirs: [mockBuiltinDir], agents: [mockBuiltinAgent] });
    renderSettingsView();
    expect(screen.getByText("/Users/test/.skillshub/db.sqlite")).toBeTruthy();
  });

  it("shows version label", () => {
    setupMocks();
    renderSettingsView();
    expect(screen.getByText("应用版本")).toBeTruthy();
  });

  it("shows database path label", () => {
    setupMocks();
    renderSettingsView();
    expect(screen.getByText("数据库路径")).toBeTruthy();
  });

  it("does not render theme flavor or accent controls in settings", () => {
    setupMocks();
    renderSettingsView();

    expect(screen.queryByText("主题风格")).toBeNull();
    expect(screen.queryByRole("button", { name: /Mocha|Macchiato|Frappé|Latte/ })).toBeNull();
    expect(screen.queryByText("强调色")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "强调色" })).toBeNull();
  });
});
