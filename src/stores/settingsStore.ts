import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  ScanDirectory,
  AgentWithStatus,
  CustomAgentConfig,
  UpdateCustomAgentConfig,
  BackupOptions,
  WebDavConfig,
  WebDavBackupFile,
} from "@/types";

// ─── State ────────────────────────────────────────────────────────────────────

interface SettingsState {
  scanDirectories: ScanDirectory[];
  isLoadingScanDirs: boolean;
  error: string | null;
  githubPat: string;
  isLoadingGitHubPat: boolean;
  isSavingGitHubPat: boolean;
  resourceLibraryDir: string;
  isLoadingResourceLibraryDir: boolean;
  webDavConfig: WebDavConfig;
  isLoadingWebDavConfig: boolean;
  isSavingWebDavConfig: boolean;

  // Actions — scan directories
  loadScanDirectories: () => Promise<void>;
  addScanDirectory: (path: string, label?: string) => Promise<ScanDirectory>;
  removeScanDirectory: (path: string) => Promise<void>;
  toggleScanDirectory: (path: string, active: boolean) => Promise<void>;

  // Actions — GitHub PAT
  loadGitHubPat: () => Promise<void>;
  saveGitHubPat: (value: string) => Promise<void>;
  clearGitHubPat: () => Promise<void>;

  // Actions — WebDAV connection
  loadWebDavConfig: () => Promise<void>;
  saveWebDavConfig: (config: WebDavConfig) => Promise<void>;

  // Actions — custom agents
  addCustomAgent: (config: CustomAgentConfig) => Promise<AgentWithStatus>;
  updateCustomAgent: (agentId: string, config: UpdateCustomAgentConfig) => Promise<AgentWithStatus>;
  removeCustomAgent: (agentId: string) => Promise<void>;
  updateCentralSkillsDir: (path: string) => Promise<AgentWithStatus>;
  loadResourceLibraryDir: () => Promise<void>;
  updateResourceLibraryDir: (path: string) => Promise<string>;
  exportAppBackup: (options?: BackupOptions) => Promise<Uint8Array>;
  importAppBackup: (backup: Uint8Array) => Promise<void>;
  listWebDavBackups: (config: WebDavConfig) => Promise<WebDavBackupFile[]>;
  uploadWebDavBackup: (config: WebDavConfig, options?: BackupOptions) => Promise<WebDavBackupFile>;
  downloadWebDavBackup: (config: WebDavConfig, remotePath: string) => Promise<Uint8Array>;

  clearError: () => void;
}

function toBackupBytes(value: number[] | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

const DEFAULT_WEBDAV_CONFIG: WebDavConfig = {
  baseUrl: "",
  username: "",
  password: "",
  remoteDir: "skillshub",
};

function normalizeWebDavConfig(config: WebDavConfig): WebDavConfig {
  return {
    baseUrl: config.baseUrl.trim(),
    username: config.username ?? "",
    password: config.password ?? "",
    remoteDir: config.remoteDir.trim() || DEFAULT_WEBDAV_CONFIG.remoteDir,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>((set) => ({
  scanDirectories: [],
  isLoadingScanDirs: false,
  error: null,
  githubPat: "",
  isLoadingGitHubPat: false,
  isSavingGitHubPat: false,
  resourceLibraryDir: "",
  isLoadingResourceLibraryDir: false,
  webDavConfig: DEFAULT_WEBDAV_CONFIG,
  isLoadingWebDavConfig: false,
  isSavingWebDavConfig: false,

  // ── Scan Directories ───────────────────────────────────────────────────────

  /**
   * Load all scan directories from the backend.
   */
  loadScanDirectories: async () => {
    set({ isLoadingScanDirs: true, error: null });
    try {
      const dirs = await invoke<ScanDirectory[]>("get_scan_directories");
      set({ scanDirectories: dirs, isLoadingScanDirs: false });
    } catch (err) {
      set({ error: String(err), isLoadingScanDirs: false });
    }
  },

  /**
   * Add a new custom scan directory.
   * Returns the created ScanDirectory or throws on error.
   */
  addScanDirectory: async (path: string, label?: string) => {
    const dir = await invoke<ScanDirectory>("add_scan_directory", {
      path,
      label: label || null,
    });
    // Refresh the list
    set((state) => ({
      scanDirectories: [...state.scanDirectories, dir],
    }));
    return dir;
  },

  /**
   * Remove a custom scan directory by path.
   */
  removeScanDirectory: async (path: string) => {
    await invoke<void>("remove_scan_directory", { path });
    set((state) => ({
      scanDirectories: state.scanDirectories.filter((d) => d.path !== path),
    }));
  },

  /**
   * Toggle the active state of a custom scan directory.
   * Persists the change to the backend database.
   */
  toggleScanDirectory: async (path: string, active: boolean) => {
    await invoke<void>("set_scan_directory_active", { path, isActive: active });
    set((state) => ({
      scanDirectories: state.scanDirectories.map((d) =>
        d.path === path ? { ...d, is_active: active } : d
      ),
    }));
  },

  // ── GitHub PAT ────────────────────────────────────────────────────────────

  loadGitHubPat: async () => {
    set({ isLoadingGitHubPat: true, error: null });
    try {
      const value = await invoke<string | null>("get_setting", { key: "github_pat" });
      set({
        githubPat: value ?? "",
        isLoadingGitHubPat: false,
      });
    } catch (err) {
      set({
        error: String(err),
        isLoadingGitHubPat: false,
      });
    }
  },

  saveGitHubPat: async (value: string) => {
    set({ isSavingGitHubPat: true, error: null });
    try {
      await invoke("set_setting", { key: "github_pat", value });
      set({
        githubPat: value.trim(),
        isSavingGitHubPat: false,
      });
    } catch (err) {
      set({
        error: String(err),
        isSavingGitHubPat: false,
      });
      throw err;
    }
  },

  clearGitHubPat: async () => {
    set({ isSavingGitHubPat: true, error: null });
    try {
      await invoke("set_setting", { key: "github_pat", value: "" });
      set({
        githubPat: "",
        isSavingGitHubPat: false,
      });
    } catch (err) {
      set({
        error: String(err),
        isSavingGitHubPat: false,
      });
      throw err;
    }
  },

  // ── WebDAV Connection ────────────────────────────────────────────────────

  loadWebDavConfig: async () => {
    set({ isLoadingWebDavConfig: true, error: null });
    try {
      const [baseUrl, username, password, remoteDir] = await Promise.all([
        invoke<string | null>("get_setting", { key: "webdav_base_url" }),
        invoke<string | null>("get_setting", { key: "webdav_username" }),
        invoke<string | null>("get_setting", { key: "webdav_password" }),
        invoke<string | null>("get_setting", { key: "webdav_remote_dir" }),
      ]);
      set({
        webDavConfig: {
          baseUrl: baseUrl ?? "",
          username: username ?? "",
          password: password ?? "",
          remoteDir: remoteDir || DEFAULT_WEBDAV_CONFIG.remoteDir,
        },
        isLoadingWebDavConfig: false,
      });
    } catch (err) {
      set({ error: String(err), isLoadingWebDavConfig: false });
    }
  },

  saveWebDavConfig: async (config) => {
    const normalized = normalizeWebDavConfig(config);
    set({ isSavingWebDavConfig: true, error: null });
    try {
      await Promise.all([
        invoke("set_setting", { key: "webdav_base_url", value: normalized.baseUrl }),
        invoke("set_setting", { key: "webdav_username", value: normalized.username ?? "" }),
        invoke("set_setting", { key: "webdav_password", value: normalized.password ?? "" }),
        invoke("set_setting", { key: "webdav_remote_dir", value: normalized.remoteDir }),
      ]);
      set({
        webDavConfig: normalized,
        isSavingWebDavConfig: false,
      });
    } catch (err) {
      set({
        error: String(err),
        isSavingWebDavConfig: false,
      });
      throw err;
    }
  },

  // ── Custom Agents ──────────────────────────────────────────────────────────

  /**
   * Register a new user-defined agent.
   * Returns the created AgentWithStatus or throws on error.
   */
  addCustomAgent: async (config: CustomAgentConfig) => {
    const agent = await invoke<AgentWithStatus>("add_custom_agent", { config });
    return agent;
  },

  /**
   * Update an existing user-defined agent.
   * Returns the updated AgentWithStatus or throws on error.
   */
  updateCustomAgent: async (agentId: string, config: UpdateCustomAgentConfig) => {
    const agent = await invoke<AgentWithStatus>("update_custom_agent", {
      agentId,
      config,
    });
    return agent;
  },

  /**
   * Remove a user-defined agent by ID.
   */
  removeCustomAgent: async (agentId: string) => {
    await invoke<void>("remove_custom_agent", { agentId });
  },

  updateCentralSkillsDir: async (path: string) => {
    return await invoke<AgentWithStatus>("update_central_skills_dir", { path });
  },

  loadResourceLibraryDir: async () => {
    set({ isLoadingResourceLibraryDir: true, error: null });
    try {
      const path = await invoke<string>("get_skill_resource_library_dir");
      set({ resourceLibraryDir: path, isLoadingResourceLibraryDir: false });
    } catch (err) {
      set({ error: String(err), isLoadingResourceLibraryDir: false });
    }
  },

  updateResourceLibraryDir: async (path: string) => {
    const updated = await invoke<string>("update_skill_resource_library_dir", { path });
    set({ resourceLibraryDir: updated });
    return updated;
  },

  exportAppBackup: async (options) => {
    const backup = await invoke<number[] | Uint8Array>("export_app_backup", {
      options: options ?? null,
    });
    return toBackupBytes(backup);
  },

  importAppBackup: async (backup: Uint8Array) => {
    await invoke<void>("import_app_backup", { backup: Array.from(backup) });
  },

  listWebDavBackups: async (config) => {
    return await invoke<WebDavBackupFile[]>("list_webdav_backups", { config });
  },

  uploadWebDavBackup: async (config, options) => {
    return await invoke<WebDavBackupFile>("upload_webdav_backup", {
      config,
      options: options ?? null,
    });
  },

  downloadWebDavBackup: async (config, remotePath) => {
    const backup = await invoke<number[] | Uint8Array>("download_webdav_backup", {
      config,
      remotePath,
    });
    return toBackupBytes(backup);
  },

  // ── Misc ───────────────────────────────────────────────────────────────────

  clearError: () => set({ error: null }),
}));
