import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Blocks,
  Database,
  Download,
  FolderOpen,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { InstallDialog } from "@/components/central/InstallDialog";
import { InstallTargetList } from "@/components/central/InstallTargetList";
import { SkillDetailDrawer } from "@/components/skill/SkillDetailDrawer";
import { SkillBrowserTable, type FolderTableItem } from "@/components/skill/SkillBrowserTable";
import { SkillBrowserViewHeading } from "@/components/skill/SkillBrowserViewHeading";
import { OpenableDirectoryPath } from "@/components/common/OpenableDirectoryPath";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HelpIcon } from "@/components/ui/help-icon";
import { SearchInput } from "@/components/ui/search-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSkillListViewMode } from "@/hooks/useSkillListViewMode";
import { useSkillTableColumns } from "@/hooks/useSkillTableColumns";
import { useConfiguredHotkey } from "@/hooks/useConfiguredHotkey";
import { isInstallTargetAgent } from "@/lib/agents";
import { normalizePathForInputDisplay } from "@/lib/path";
import { buildSearchText, normalizeSearchQuery } from "@/lib/search";
import {
  splitResourceLibrarySkillsByFolder,
  type SkillFolderGroup,
} from "@/lib/skillFolders";
import {
  sortBySkillBrowserOrder,
  sortFoldersBySkillBrowserOrder,
  type SkillSortDirection,
  type SkillSortField,
} from "@/lib/skillSort";
import { cn } from "@/lib/utils";
import { listen, isTauriRuntime } from "@/lib/tauri";
import { toErrorMessage } from "@/lib/errorMessage";
import { useAppStatusStore, type AppStatusTaskItem } from "@/stores/appStatusStore";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { usePlatformStore } from "@/stores/platformStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import { useSkillStore } from "@/stores/skillStore";
import type {
  CentralSkillBundleDeletePreview,
  RepositorySyncApplyOptions,
  RepositorySyncPreviewReport,
  SkillSourceUpdateProgress,
  SkillSourceUpdateReport,
  SkillWithLinks,
} from "@/types";

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-20">
      <div className="rounded-full bg-muted/60 p-4">
        <Database className="size-12 text-muted-foreground opacity-60" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}

function githubRepoFromSourceLabel(source?: string | null): string | null {
  const prefix = "github:";
  if (!source?.startsWith(prefix)) return null;
  const repo = source.slice(prefix.length).trim();
  return repo.includes("/") ? repo : null;
}

function resourceSkillSourceRepo(skill: SkillWithLinks): string | null {
  return skill.source_repo ?? githubRepoFromSourceLabel(skill.source) ?? null;
}

function isSourceBackedSkill(skill: SkillWithLinks) {
  return !!(skill.source_url || (resourceSkillSourceRepo(skill) && skill.source_path));
}

function sourceUpdateItems(
  skills: SkillWithLinks[],
  report: SkillSourceUpdateReport | null | undefined
): AppStatusTaskItem[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const seen = new Set<string>();
  const items: AppStatusTaskItem[] = (report?.items ?? []).map((outcome) => {
    seen.add(outcome.skillId);
    const skill = byId.get(outcome.skillId);
    return {
      skillId: outcome.skillId,
      name: skill?.name ?? outcome.name,
      status: outcome.status,
      repository: skill?.source_repo ?? null,
      detail: outcome.error ?? null,
    };
  });
  for (const skill of skills) {
    if (skill.source === "local-folder" && !seen.has(skill.id)) {
      items.push({
        skillId: skill.id,
        name: skill.name,
        status: "skipped",
        repository: skill.source_repo ?? null,
      });
    }
  }
  return items;
}

function latestSkillUpdatedAt(skills: SkillWithLinks[]) {
  return skills.reduce<string | null>((latest, skill) => {
    const value = skill.updated_at ?? skill.scanned_at ?? null;
    if (!value) return latest;
    if (!latest) return value;
    return Date.parse(value) > Date.parse(latest) ? value : latest;
  }, null);
}

function earliestSkillCreatedAt(skills: SkillWithLinks[]) {
  return skills.reduce<string | null>((earliest, skill) => {
    const value = skill.created_at ?? skill.scanned_at ?? null;
    if (!value) return earliest;
    if (!earliest) return value;
    return Date.parse(value) < Date.parse(earliest) ? value : earliest;
  }, null);
}

function formatTaskError(error: unknown): string {
  const message = toErrorMessage(error).replace(/^Error:\s*/i, "").trim();
  if (!message) return "Unknown error";
  if (message.length <= 1200) return message;
  return `…${message.slice(-1200)}`;
}

export function ResourceLibraryView() {
  const { t } = useTranslation();
  const skills = useResourceLibraryStore((state) => state.skills);
  const agents = useResourceLibraryStore((state) => state.agents);
  const resourceLibraryDir = useResourceLibraryStore((state) => state.resourceLibraryDir);
  const isLoading = useResourceLibraryStore((state) => state.isLoading);
  const isUpdatingSources = useResourceLibraryStore((state) => state.isUpdatingSources);
  const togglingAgentId = useResourceLibraryStore((state) => state.togglingAgentId);
  const deletingSkillId = useResourceLibraryStore((state) => state.deletingSkillId);
  const loadResourceLibrary = useResourceLibraryStore((state) => state.loadResourceLibrary);
  const installSkill = useResourceLibraryStore((state) => state.installSkill);
  const addToCentral = useResourceLibraryStore((state) => state.addToCentral);
  const removeFromCentral = useResourceLibraryStore((state) => state.removeFromCentral);
  const togglePlatformLink = useResourceLibraryStore((state) => state.togglePlatformLink);
  const importSkillsViaNpx = useResourceLibraryStore((state) => state.importSkillsViaNpx);
  const addLocalSkills = useResourceLibraryStore((state) => state.addLocalSkills);
  const previewDeleteResourceBundle = useResourceLibraryStore(
    (state) => state.previewDeleteResourceBundle
  );
  const deleteResourceBundle = useResourceLibraryStore((state) => state.deleteResourceBundle);
  const deleteResourceSkill = useResourceLibraryStore((state) => state.deleteResourceSkill);
  const updateSourceBackedSkills = useResourceLibraryStore(
    (state) => state.updateSourceBackedSkills
  );
  const previewRepositorySync = useResourceLibraryStore((state) => state.previewRepositorySync);
  const syncSourceBackedSkills = useResourceLibraryStore((state) => state.syncSourceBackedSkills);
  const updateSourceBackedSkill = useResourceLibraryStore(
    (state) => state.updateSourceBackedSkill
  );
  const startStatusTask = useAppStatusStore((state) => state.startTask);
  const updateStatusTask = useAppStatusStore((state) => state.updateTask);
  const completeStatusTask = useAppStatusStore((state) => state.completeTask);
  const failStatusTask = useAppStatusStore((state) => state.failTask);

  const refreshCounts = usePlatformStore((state) => state.refreshCounts);
  const loadCentralSkills = useCentralSkillsStore((state) => state.loadCentralSkills);
  const getSkillsByAgent = useSkillStore((state) => state.getSkillsByAgent);
  const uninstallSkillFromAgent = useSkillStore((state) => state.uninstallSkillFromAgent);

  const [viewMode, setViewMode] = useSkillListViewMode("resource-library");
  useConfiguredHotkey("toggleSkillViewMode", () => {
    setViewMode(viewMode === "all" ? "folders" : "all");
  });
  const {
    visibleColumns: visibleSkillColumns,
    toggleColumn: toggleSkillColumn,
    resetColumns: resetSkillColumns,
  } = useSkillTableColumns("skill");
  const {
    visibleColumns: visibleFolderColumns,
    toggleColumn: toggleFolderColumn,
    resetColumns: resetFolderColumns,
  } = useSkillTableColumns("folder");
  const [sortField, setSortField] = useState<SkillSortField>("name");
  const [sortDirection, setSortDirection] = useState<SkillSortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);
  const [installTargetSkill, setInstallTargetSkill] = useState<SkillWithLinks | null>(null);
  const [deleteTargetSkill, setDeleteTargetSkill] = useState<SkillWithLinks | null>(null);
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const [drawerSkillId, setDrawerSkillId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [updatingSkillId, setUpdatingSkillId] = useState<string | null>(null);
  const [isNpxImportOpen, setIsNpxImportOpen] = useState(false);
  const [npxImportInput, setNpxImportInput] = useState("");
  const [npxImportSkill, setNpxImportSkill] = useState("");
  const [isNpxImporting, setIsNpxImporting] = useState(false);
  const [isLocalAddOpen, setIsLocalAddOpen] = useState(false);
  const [localSourceDir, setLocalSourceDir] = useState("");
  const [isAddingLocal, setIsAddingLocal] = useState(false);
  const [folderDeletePreview, setFolderDeletePreview] =
    useState<CentralSkillBundleDeletePreview | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [folderInstallTargetIds, setFolderInstallTargetIds] = useState<Set<string>>(new Set());
  const [folderUninstallTargetIds, setFolderUninstallTargetIds] = useState<Set<string>>(new Set());
  const [folderInstallMethod, setFolderInstallMethod] = useState<"auto" | "symlink" | "copy">("auto");
  const [folderActionGroupKey, setFolderActionGroupKey] = useState<string | null>(null);
  const [folderActionMode, setFolderActionMode] = useState<"install" | "uninstall" | null>(null);
  const [pendingFolderAction, setPendingFolderAction] = useState<
    "central" | "install" | "uninstall" | "update" | null
  >(null);
  const [pendingFolderActionKey, setPendingFolderActionKey] = useState<string | null>(null);
  const [repositorySyncPreview, setRepositorySyncPreview] =
    useState<RepositorySyncPreviewReport | null>(null);
  const [isRepositorySyncPreviewOpen, setIsRepositorySyncPreviewOpen] = useState(false);
  const [isRepositorySyncPreviewLoading, setIsRepositorySyncPreviewLoading] = useState(false);
  const [removeRemoteDeleted, setRemoveRemoteDeleted] = useState(false);
  const [pendingRepositorySync, setPendingRepositorySync] = useState(false);
  const detailButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const effectiveSearchQuery = skills.length > 80 ? deferredSearchQuery : searchQuery;
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(effectiveSearchQuery),
    [effectiveSearchQuery]
  );

  useEffect(() => {
    loadResourceLibrary();
  }, [loadResourceLibrary]);

  const folderSplit = useMemo(
    () => splitResourceLibrarySkillsByFolder(skills, resourceLibraryDir),
    [resourceLibraryDir, skills]
  );

  const folderGroupsByPath = useMemo(
    () => new Map(folderSplit.groups.map((group) => [group.relativePath, group])),
    [folderSplit.groups]
  );
  const activeFolder = activeFolderKey ? folderGroupsByPath.get(activeFolderKey) ?? null : null;

  useEffect(() => {
    if (viewMode === "all") {
      setActiveFolderKey(null);
      return;
    }
    if (activeFolderKey && !folderGroupsByPath.has(activeFolderKey)) {
      setActiveFolderKey(null);
    }
  }, [activeFolderKey, folderGroupsByPath, viewMode]);

  useEffect(() => {
    setFolderInstallTargetIds(new Set());
    setFolderUninstallTargetIds(new Set());
    setFolderInstallMethod("auto");
    setPendingFolderAction(null);
  }, [activeFolderKey]);

  const availableTags = useMemo(() => {
    const tags = new Map<string, string>();
    for (const skill of skills) {
      for (const tag of skill.tags ?? []) {
        const normalized = tag.toLowerCase();
        if (!tags.has(normalized)) {
          tags.set(normalized, tag);
        }
      }
    }
    return Array.from(tags.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [skills]);

  const visibleSkills =
    viewMode === "folders" ? activeFolder?.skills ?? [] : skills;
  const filteredSkills = useMemo(() => {
    return visibleSkills.filter((skill) => {
      if (selectedTag && !(skill.tags ?? []).some((tag) => tag.toLowerCase() === selectedTag)) {
        return false;
      }
      if (!normalizedSearchQuery) return true;
      return buildSearchText([
        skill.name,
        skill.description,
        skill.notes,
        ...(skill.tags ?? []),
        skill.source_author,
        skill.source_repo,
      ]).includes(normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, selectedTag, visibleSkills]);

  const sortedSkills = useMemo(() => {
    return sortBySkillBrowserOrder(filteredSkills, sortField, sortDirection);
  }, [filteredSkills, sortDirection, sortField]);

  const filteredFolders = useMemo(() => {
    if (viewMode !== "folders" || activeFolder) return [];
    const filtered = folderSplit.groups.filter((group) => {
      if (
        selectedTag &&
        !group.skills.some((skill) =>
          (skill.tags ?? []).some((tag) => tag.toLowerCase() === selectedTag)
        )
      ) {
        return false;
      }
      if (!normalizedSearchQuery) return true;
      return buildSearchText([
        group.name,
        group.path,
        ...group.skills.map((skill) => skill.name),
      ]).includes(normalizedSearchQuery);
    });
    return sortFoldersBySkillBrowserOrder(filtered, sortField, sortDirection);
  }, [
    activeFolder,
    folderSplit.groups,
    normalizedSearchQuery,
    selectedTag,
    sortDirection,
    sortField,
    viewMode,
  ]);

  const availableInstallAgents = useMemo(
    () => agents.filter(isInstallTargetAgent),
    [agents]
  );

  async function refreshSyncedInstallTargets(agentIds?: string[]) {
    const targetIds = agentIds ?? availableInstallAgents.map((agent) => agent.id);
    await Promise.all([
      refreshCounts(),
      ...targetIds.map((agentId) => getSkillsByAgent(agentId)),
    ]);
  }

  const folderActionGroup = folderActionGroupKey
    ? folderGroupsByPath.get(folderActionGroupKey) ?? null
    : null;
  const folderActionLinkedAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const skill of folderActionGroup?.skills ?? []) {
      for (const agentId of skill.linked_agents) {
        ids.add(agentId);
      }
    }
    return ids;
  }, [folderActionGroup?.skills]);
  const folderActionUninstallAgents = useMemo(
    () => availableInstallAgents.filter((agent) => folderActionLinkedAgentIds.has(agent.id)),
    [folderActionLinkedAgentIds, availableInstallAgents]
  );
  async function handleRefresh() {
    await loadResourceLibrary();
  }

  function handleOpenDrawer(skillId: string) {
    setDrawerSkillId(skillId);
    setIsDrawerOpen(true);
  }

  function setDetailButtonRef(skillId: string, node: HTMLButtonElement | null) {
    if (node) {
      detailButtonRefs.current[skillId] = node;
    } else {
      delete detailButtonRefs.current[skillId];
    }
  }

  function handleInstallClick(skill: SkillWithLinks) {
    setInstallTargetSkill(skill);
    setIsInstallDialogOpen(true);
  }

  async function handleInstall(skillId: string, agentIds: string[], method: string) {
    const result = await installSkill(skillId, agentIds, method);
    if (result.failed.length > 0) {
      toast.error(
        t("central.installPartialFail", {
          platforms: result.failed.map((item) => item.agent_id).join(", "),
        })
      );
    }
    await Promise.all([
      refreshCounts(),
      ...agentIds.map((agentId) => getSkillsByAgent(agentId)),
    ]);
    return result;
  }

  async function handleTogglePlatform(skillId: string, agentId: string) {
    try {
      await togglePlatformLink(skillId, agentId);
      await Promise.all([refreshCounts(), getSkillsByAgent(agentId)]);
    } catch (err) {
      toast.error(t("central.installError", { error: String(err) }));
    }
  }

  function replaceStatusItem(
    items: AppStatusTaskItem[],
    target: AppStatusTaskItem,
    patch: Partial<AppStatusTaskItem>
  ) {
    return items.map((item) => {
      const sameSkill = target.skillId && item.skillId === target.skillId;
      const sameFallback =
        !target.skillId &&
        item.name === target.name &&
        item.repository === target.repository &&
        item.status === target.status;
      return sameSkill || sameFallback ? { ...item, ...patch } : item;
    });
  }

  function updateStatusItems(items: AppStatusTaskItem[]) {
    updateStatusTask({
      updatedCount: items.filter((item) => item.status === "updated").length,
      unchangedCount: items.filter((item) => item.status === "unchanged").length,
      deletedCount: items.filter((item) => item.status === "deleted").length,
      skippedCount: items.filter((item) => item.status === "skipped").length,
      failedCount: items.filter((item) => item.status === "failed").length,
      items,
    });
  }

  async function handleRetryFailedStatusItem(item: AppStatusTaskItem) {
    const skill = skills.find((candidate) => candidate.id === item.skillId);
    if (!skill) {
      toast.error(t("resource.updateSourcesError", { error: item.name }));
      return;
    }

    setUpdatingSkillId(skill.id);
    const currentItems = useAppStatusStore.getState().task?.items ?? [];
    updateStatusItems(replaceStatusItem(currentItems, item, {
      detail: t("status.resourceSourceUpdatingItem", { name: skill.name }),
    }));

    try {
      await updateSourceBackedSkill(skill.id);
      const nextItems = replaceStatusItem(
        useAppStatusStore.getState().task?.items ?? currentItems,
        item,
        { status: "updated", detail: null }
      );
      updateStatusItems(nextItems);
      toast.success(t("central.updateSourceSuccess", { name: skill.name }));
    } catch (err) {
      const errorMessage = formatTaskError(err);
      const nextItems = replaceStatusItem(
        useAppStatusStore.getState().task?.items ?? currentItems,
        item,
        { status: "failed", detail: errorMessage }
      );
      updateStatusItems(nextItems);
      toast.error(t("central.updateSourceError", { name: skill.name, error: String(err) }));
    } finally {
      setUpdatingSkillId(null);
    }
  }

  function handleManualCheckFailedStatusItem(item: AppStatusTaskItem) {
    const skill = skills.find((candidate) => candidate.id === item.skillId);
    if (!skill) {
      toast.error(t("resource.updateSourcesError", { error: item.name }));
      return;
    }
    void handleUpdateSingleSource(skill);
  }

  function repositorySyncNeedsConfirmation(report: RepositorySyncPreviewReport) {
    return report.repositories.some(
      (repository) =>
        repository.error ||
        repository.added.length > 0 ||
        repository.modified.length > 0 ||
        repository.deleted.length > 0
    );
  }

  async function runUpdateSources(options?: RepositorySyncApplyOptions) {
    startStatusTask({
      id: "resource-source-update",
      label: t("status.resourceSourceUpdate"),
      detail: t("status.resourceSourceConnecting"),
      currentCount: 0,
      totalCount: 0,
    });
    let unlisten: (() => void) | undefined;
    if (isTauriRuntime()) {
      unlisten = await listen<SkillSourceUpdateProgress>("skill-source-update:progress", (event) => {
        const current = event.payload.current;
        const total = event.payload.total;
        const name = event.payload.name;
        updateStatusTask({
          currentCount: current,
          totalCount: total,
          detail: t("status.resourceSourceUpdatingItem", { name }),
        });
      });
    }
    try {
      const report = options
        ? await syncSourceBackedSkills(options)
        : await updateSourceBackedSkills();
      await Promise.all([loadCentralSkills(), refreshSyncedInstallTargets()]);
      const items = sourceUpdateItems(skills, report);
      const updatedCount = items.filter((item) => item.status === "updated").length;
      const unchangedCount = items.filter((item) => item.status === "unchanged").length;
      const deletedCount = items.filter((item) => item.status === "deleted").length;
      const skippedCount = items.filter((item) => item.status === "skipped").length;
      const failedCount = items.filter((item) => item.status === "failed").length;
      completeStatusTask({
        detail: t("status.resourceSourceUpdated", { count: updatedCount }),
        updatedCount,
        unchangedCount,
        deletedCount,
        skippedCount,
        failedCount,
        items,
        onRetryFailedItem: handleRetryFailedStatusItem,
        onManualCheckFailedItem: handleManualCheckFailedStatusItem,
      });
      toast.success(t("resource.updateSourcesSuccess", { count: updatedCount }));
    } catch (err) {
      const errorMessage = formatTaskError(err);
      failStatusTask({
        detail: errorMessage,
        error: errorMessage,
        failedCount: 1,
        items: [{ name: t("status.resourceSourceUpdate"), status: "failed", detail: errorMessage }],
      });
      toast.error(t("resource.updateSourcesError", { error: String(err) }));
    } finally {
      unlisten?.();
    }
  }

  async function handleUpdateSources() {
    if (isRepositorySyncPreviewLoading || pendingRepositorySync) return;
    setIsRepositorySyncPreviewLoading(true);
    try {
      const report = await previewRepositorySync();
      if (repositorySyncNeedsConfirmation(report)) {
        setRepositorySyncPreview(report);
        setRemoveRemoteDeleted(false);
        setIsRepositorySyncPreviewOpen(true);
        return;
      }
      await runUpdateSources();
    } catch (err) {
      const errorMessage = formatTaskError(err);
      failStatusTask({
        detail: errorMessage,
        error: errorMessage,
        failedCount: 1,
        items: [{ name: t("status.resourceSourceUpdate"), status: "failed", detail: errorMessage }],
      });
      toast.error(t("resource.updateSourcesError", { error: String(err) }));
    } finally {
      setIsRepositorySyncPreviewLoading(false);
    }
  }

  async function handleConfirmRepositorySync() {
    if (pendingRepositorySync) return;
    setPendingRepositorySync(true);
    setIsRepositorySyncPreviewOpen(false);
    try {
      await runUpdateSources({ removeDeleted: removeRemoteDeleted });
    } finally {
      setPendingRepositorySync(false);
    }
  }

  async function handleUpdateSingleSource(skill: SkillWithLinks) {
    setUpdatingSkillId(skill.id);
    startStatusTask({
      id: `resource-source-update:${skill.id}`,
      label: t("status.resourceSingleSourceUpdate", { name: skill.name }),
      detail: t("status.resourceSourceUpdatingItem", { name: skill.name }),
      currentCount: 1,
      totalCount: 1,
    });
    try {
      await updateSourceBackedSkill(skill.id);
      completeStatusTask({
        detail: t("status.resourceSingleSourceUpdated", { name: skill.name }),
        updatedCount: 1,
      });
      toast.success(t("central.updateSourceSuccess", { name: skill.name }));
    } catch (err) {
      const errorMessage = formatTaskError(err);
      failStatusTask({
        detail: errorMessage,
        error: errorMessage,
      });
      toast.error(t("central.updateSourceError", { name: skill.name, error: String(err) }));
    } finally {
      setUpdatingSkillId(null);
    }
  }

  async function handleAddToCentral(skill: SkillWithLinks) {
    setUpdatingSkillId(skill.id);
    try {
      await addToCentral(skill.id);
      await Promise.all([loadCentralSkills(), refreshSyncedInstallTargets()]);
      toast.success(t("resource.addToCentralSuccess", { name: skill.name }));
    } catch (err) {
      toast.error(t("resource.addToCentralError", { name: skill.name, error: String(err) }));
    } finally {
      setUpdatingSkillId(null);
    }
  }

  async function handleRemoveFromCentral(skill: SkillWithLinks) {
    setUpdatingSkillId(skill.id);
    try {
      const affectedAgentIds = [
        ...skill.linked_agents,
        ...(skill.read_only_agents ?? []),
      ];
      await removeFromCentral(skill.id);
      await Promise.all([
        loadCentralSkills(),
        refreshCounts(),
        ...affectedAgentIds.map((agentId) => getSkillsByAgent(agentId)),
      ]);
      toast.success(t("resource.removeFromCentralSuccess", { name: skill.name }));
    } catch (err) {
      toast.error(t("resource.removeFromCentralError", { error: String(err) }));
    } finally {
      setUpdatingSkillId(null);
    }
  }

  async function handleUninstallFromAllTargets(skill: SkillWithLinks) {
    setUpdatingSkillId(skill.id);
    try {
      for (const agentId of skill.linked_agents) {
        await uninstallSkillFromAgent(skill.id, agentId);
      }
      await Promise.all([
        loadResourceLibrary(),
        refreshCounts(),
        ...skill.linked_agents.map((agentId) => getSkillsByAgent(agentId)),
      ]);
    } catch (err) {
      toast.error(t("detail.uninstallError", { error: String(err) }));
    } finally {
      setUpdatingSkillId(null);
    }
  }

  function closeFolderActionDialog() {
    setFolderActionMode(null);
    setFolderActionGroupKey(null);
    setFolderInstallTargetIds(new Set());
    setFolderUninstallTargetIds(new Set());
    setFolderInstallMethod("auto");
  }

  function handleFolderInstallTargetChange(agentId: string, checked: boolean) {
    setFolderInstallTargetIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(agentId);
      } else {
        next.delete(agentId);
      }
      return next;
    });
  }

  function handleFolderUninstallTargetChange(agentId: string, checked: boolean) {
    setFolderUninstallTargetIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(agentId);
      } else {
        next.delete(agentId);
      }
      return next;
    });
  }

  function handleOpenInstallFolder(group: SkillFolderGroup<SkillWithLinks>) {
    setFolderActionGroupKey(group.relativePath);
    setFolderActionMode("install");
    setFolderInstallTargetIds(new Set());
    setFolderInstallMethod("symlink");
  }

  function handleOpenUninstallFolder(group: SkillFolderGroup<SkillWithLinks>) {
    setFolderActionGroupKey(group.relativePath);
    setFolderActionMode("uninstall");
    setFolderUninstallTargetIds(new Set());
  }

  async function handleAddFolderToCentral(group: SkillFolderGroup<SkillWithLinks>) {
    if (pendingFolderAction) return;
    setPendingFolderAction("central");
    setPendingFolderActionKey(group.relativePath);
    try {
      for (const skill of group.skills) {
        if (!skill.is_central) {
          await addToCentral(skill.id);
        }
      }
      await Promise.all([
        loadResourceLibrary(),
        loadCentralSkills(),
        refreshSyncedInstallTargets(),
      ]);
      toast.success(t("skillFolder.addFolderToCentralSuccess", { count: group.skills.length }));
    } catch (err) {
      toast.error(t("resource.addToCentralError", { name: group.name, error: String(err) }));
    } finally {
      setPendingFolderAction(null);
      setPendingFolderActionKey(null);
    }
  }

  async function handleRemoveFolderFromCentral(group: SkillFolderGroup<SkillWithLinks>) {
    if (pendingFolderAction) return;
    setPendingFolderAction("central");
    setPendingFolderActionKey(group.relativePath);
    try {
      for (const skill of group.skills) {
        if (skill.is_central) {
          await removeFromCentral(skill.id);
        }
      }
      await Promise.all([
        loadResourceLibrary(),
        loadCentralSkills(),
        refreshSyncedInstallTargets(),
      ]);
    } catch (err) {
      toast.error(t("resource.removeFromCentralError", { error: String(err) }));
    } finally {
      setPendingFolderAction(null);
      setPendingFolderActionKey(null);
    }
  }

  async function handleUpdateFolderSources(group: SkillFolderGroup<SkillWithLinks>) {
    if (pendingFolderAction) return;
    setPendingFolderAction("update");
    setPendingFolderActionKey(group.relativePath);
    startStatusTask({
      id: `resource-source-update-folder:${group.relativePath}`,
      label: t("status.resourceFolderSourceUpdate", { name: group.name }),
      detail: t("status.resourceSourceConnecting"),
      currentCount: 0,
      totalCount: group.skills.length,
    });

    const items: AppStatusTaskItem[] = [];
    try {
      for (const [index, skill] of group.skills.entries()) {
        updateStatusTask({
          currentCount: index + 1,
          totalCount: group.skills.length,
          detail: t("status.resourceSourceUpdatingItem", { name: skill.name }),
        });

        if (!isSourceBackedSkill(skill)) {
          items.push({
            skillId: skill.id,
            name: skill.name,
            status: "skipped",
            repository: skill.source_repo ?? null,
          });
          updateStatusItems(items);
          continue;
        }

        setUpdatingSkillId(skill.id);
        try {
          await updateSourceBackedSkill(skill.id);
          items.push({
            skillId: skill.id,
            name: skill.name,
            status: "updated",
            repository: resourceSkillSourceRepo(skill),
          });
        } catch (err) {
          items.push({
            skillId: skill.id,
            name: skill.name,
            status: "failed",
            repository: resourceSkillSourceRepo(skill),
            detail: formatTaskError(err),
          });
        } finally {
          setUpdatingSkillId(null);
          updateStatusItems(items);
        }
      }

      await loadResourceLibrary();
      const updatedCount = items.filter((item) => item.status === "updated").length;
      completeStatusTask({
        detail: t("status.resourceSourceUpdated", { count: updatedCount }),
        updatedCount,
        unchangedCount: items.filter((item) => item.status === "unchanged").length,
        skippedCount: items.filter((item) => item.status === "skipped").length,
        failedCount: items.filter((item) => item.status === "failed").length,
        items,
        onRetryFailedItem: handleRetryFailedStatusItem,
        onManualCheckFailedItem: handleManualCheckFailedStatusItem,
      });
      toast.success(t("resource.updateSourcesSuccess", { count: updatedCount }));
    } catch (err) {
      const errorMessage = formatTaskError(err);
      failStatusTask({
        detail: errorMessage,
        error: errorMessage,
        failedCount: 1,
        items,
      });
      toast.error(t("resource.updateSourcesError", { error: String(err) }));
    } finally {
      setPendingFolderAction(null);
      setPendingFolderActionKey(null);
      setUpdatingSkillId(null);
    }
  }

  async function handleInstallFolderToTarget() {
    const isFolderCentral =
      folderActionGroup?.skills.every((skill) => skill.is_central) ?? false;
    const targetIds = Array.from(folderInstallTargetIds).filter((agentId) => {
      const agent = availableInstallAgents.find((candidate) => candidate.id === agentId);
      if (!agent) return false;
      return !(agent.shares_central_skills && isFolderCentral);
    });
    if (!folderActionGroup || targetIds.length === 0 || pendingFolderAction) return;
    setPendingFolderAction("install");
    setPendingFolderActionKey(folderActionGroup.relativePath);
    try {
      let failedCount = 0;
      for (const skill of folderActionGroup.skills) {
        const result = await installSkill(skill.id, targetIds, folderInstallMethod);
        failedCount += result.failed.length;
      }
      await Promise.all([
        loadResourceLibrary(),
        refreshCounts(),
        ...targetIds.map((agentId) => getSkillsByAgent(agentId)),
      ]);
      if (failedCount > 0) {
        toast.error(t("skillFolder.installFolderPartialFail", { count: failedCount }));
        return;
      }
      toast.success(t("skillFolder.installFolderSuccess", { count: folderActionGroup.skills.length }));
      closeFolderActionDialog();
    } catch (err) {
      toast.error(t("central.installError", { error: String(err) }));
    } finally {
      setPendingFolderAction(null);
      setPendingFolderActionKey(null);
    }
  }

  async function handleUninstallFolderFromTarget() {
    const targetIds = Array.from(folderUninstallTargetIds);
    if (!folderActionGroup || targetIds.length === 0 || pendingFolderAction) return;
    setPendingFolderAction("uninstall");
    setPendingFolderActionKey(folderActionGroup.relativePath);
    try {
      let uninstallCount = 0;
      for (const agentId of targetIds) {
        const removableSkills = folderActionGroup.skills.filter((skill) =>
          skill.linked_agents.includes(agentId)
        );
        uninstallCount += removableSkills.length;
        for (const skill of removableSkills) {
          await uninstallSkillFromAgent(skill.id, agentId);
        }
      }
      await Promise.all([
        loadResourceLibrary(),
        refreshCounts(),
        ...targetIds.map((agentId) => getSkillsByAgent(agentId)),
      ]);
      toast.success(t("skillFolder.uninstallFolderSuccess", { count: uninstallCount }));
      closeFolderActionDialog();
    } catch (err) {
      toast.error(t("detail.uninstallError", { error: String(err) }));
    } finally {
      setPendingFolderAction(null);
      setPendingFolderActionKey(null);
    }
  }

  function linkedAgentNames(skill: SkillWithLinks) {
    const affectedIds = new Set([
      ...skill.linked_agents,
      ...(skill.read_only_agents ?? []),
    ]);
    return agents
      .filter((agent) => affectedIds.has(agent.id))
      .map((agent) => agent.display_name);
  }

  async function handleDeleteResourceSkill(skill: SkillWithLinks, cascadeUninstall: boolean) {
    try {
      await deleteResourceSkill(skill.id, { cascadeUninstall });
      await Promise.all([
        refreshCounts(),
        loadCentralSkills(),
        ...skill.linked_agents.map((agentId) => getSkillsByAgent(agentId)),
      ]);
      toast.success(t("resource.deleteSuccess", { name: skill.name }));
      setDeleteTargetSkill(null);
    } catch (err) {
      toast.error(t("resource.deleteError", { error: String(err) }));
    }
  }

  function handleDeleteClick(skill: SkillWithLinks) {
    if (skill.linked_agents.length > 0 || (skill.read_only_agents?.length ?? 0) > 0) {
      setDeleteTargetSkill(skill);
      return;
    }

    void handleDeleteResourceSkill(skill, false);
  }

  async function handleImportViaNpx() {
    const input = npxImportInput.trim();
    if (!input || isNpxImporting) return;
    setIsNpxImporting(true);
    startStatusTask({
      id: "resource-npx-import",
      label: t("resource.npxImportStatus"),
      detail: t("resource.npxImportConnecting"),
    });
    try {
      const result = await importSkillsViaNpx({
        input,
        skill: npxImportSkill.trim() || null,
        overwrite: true,
      });
      await Promise.all([loadResourceLibrary(), loadCentralSkills(), refreshCounts()]);
      completeStatusTask({
        detail: t("resource.npxImportSuccessDetail", {
          count: result.localImport.addedSkills.length,
        }),
        updatedCount: result.localImport.addedSkills.length,
      });
      toast.success(
        t("resource.npxImportSuccess", { count: result.localImport.addedSkills.length })
      );
      setIsNpxImportOpen(false);
      setNpxImportInput("");
      setNpxImportSkill("");
    } catch (err) {
      const errorMessage = formatTaskError(err);
      failStatusTask({ detail: errorMessage, error: errorMessage });
      toast.error(t("resource.npxImportError", { error: errorMessage }));
    } finally {
      setIsNpxImporting(false);
    }
  }

  async function handleChooseLocalSourceDir() {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t("resource.localAddChooseTitle"),
    });
    if (typeof selected === "string") {
      setLocalSourceDir(normalizePathForInputDisplay(selected));
    }
  }

  async function handleAddLocalSkills() {
    const sourceDir = normalizePathForInputDisplay(localSourceDir).trim();
    if (!sourceDir || isAddingLocal) return;
    setIsAddingLocal(true);
    try {
      const result = await addLocalSkills({ sourceDir, overwrite: true });
      await Promise.all([loadResourceLibrary(), loadCentralSkills(), refreshCounts()]);
      toast.success(t("resource.localAddSuccess", { count: result.addedSkills.length }));
      setIsLocalAddOpen(false);
      setLocalSourceDir("");
    } catch (err) {
      toast.error(t("resource.localAddError", { error: String(err) }));
    } finally {
      setIsAddingLocal(false);
    }
  }

  async function handleDeleteFolderClick(group: SkillFolderGroup<SkillWithLinks>) {
    try {
      const preview = await previewDeleteResourceBundle(group.relativePath);
      setFolderDeletePreview(preview);
    } catch (err) {
      toast.error(t("resource.deleteFolderError", { error: String(err) }));
    }
  }

  async function handleConfirmDeleteFolder() {
    if (!folderDeletePreview) return;
    const cascadeUninstall = folderDeletePreview.affectedAgents.length > 0;
    setIsDeletingFolder(true);
    try {
      await deleteResourceBundle(folderDeletePreview.bundle.relativePath, { cascadeUninstall });
      await Promise.all([
        refreshCounts(),
        loadCentralSkills(),
        ...folderDeletePreview.affectedAgents.map((agentId) => getSkillsByAgent(agentId)),
      ]);
      toast.success(t("resource.deleteFolderSuccess", { name: folderDeletePreview.bundle.name }));
      setFolderDeletePreview(null);
    } catch (err) {
      toast.error(t("resource.deleteFolderError", { error: String(err) }));
    } finally {
      setIsDeletingFolder(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{t("resource.title")}</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isLoading}
              aria-label={t("resource.refresh")}
            >
              <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
            </Button>
          </div>
          <OpenableDirectoryPath
            path={resourceLibraryDir}
            displayPath={resourceLibraryDir || t("resource.path")}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleUpdateSources}
            disabled={isUpdatingSources || isRepositorySyncPreviewLoading || pendingRepositorySync}
          >
            {isUpdatingSources || isRepositorySyncPreviewLoading || pendingRepositorySync ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t("resource.updateSources")}
          </Button>
          <Button variant="outline" onClick={() => setIsNpxImportOpen(true)}>
            <Download className="size-4" />
            {t("resource.importSkills")}
          </Button>
          <Button variant="outline" onClick={() => setIsLocalAddOpen(true)}>
            <Plus className="size-4" />
            {t("resource.addSkills")}
          </Button>
        </div>
      </div>

      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <SearchInput
            placeholder={t("resource.searchPlaceholder")}
            value={searchQuery}
            onValueChange={setSearchQuery}
            containerClassName="min-w-0 flex-1"
            aria-label={t("resource.searchPlaceholder")}
          />
          <SkillBrowserViewHeading
            value={viewMode}
            onChange={setViewMode}
            className="shrink-0"
          />
        </div>
        {availableTags.length > 0 && (
          <div role="group" aria-label={t("central.tagFilter")} className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("central.tagFilter")}</span>
            <button
              type="button"
              aria-pressed={selectedTag === null}
              onClick={() => setSelectedTag(null)}
              className={cn(
                "h-7 rounded-lg px-2.5 text-xs font-medium transition-colors",
                selectedTag === null
                  ? "bg-primary/15 text-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {t("central.allTags")}
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag.key}
                type="button"
                aria-pressed={selectedTag === tag.key}
                onClick={() => setSelectedTag(selectedTag === tag.key ? null : tag.key)}
                className={cn(
                  "h-7 rounded-lg px-2.5 text-xs font-medium transition-colors",
                  selectedTag === tag.key
                    ? "bg-primary/15 text-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                #{tag.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <EmptyState message={t("resource.loading")} />
        ) : skills.length === 0 ? (
          <EmptyState message={t("resource.noSkills")} />
        ) : (
          <div className="space-y-6">
            {viewMode === "folders" && activeFolder && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setActiveFolderKey(null)}>
                  <ArrowLeft className="size-4" />
                  {t("resource.backToFolders")}
                </Button>
                <span className="text-sm font-medium text-muted-foreground">
                  {activeFolder.name}
                </span>
              </div>
            )}

            {viewMode === "folders" && !activeFolder && filteredFolders.length > 0 && (
              <section className="space-y-3" aria-label={t("skillFolder.foldersTitle")}>
                <SkillBrowserTable
                  kind="folder"
                  visibleColumns={visibleFolderColumns}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSortChange={(field, direction) => {
                    setSortField(field);
                    setSortDirection(direction);
                  }}
                  onToggleColumn={toggleFolderColumn}
                  onResetColumns={resetFolderColumns}
                  folders={filteredFolders.map(
                    (group): FolderTableItem => ({
                      key: group.relativePath,
                      name: group.name,
                      path: group.path,
                      skillCount: group.skillCount,
                      installAgents: agents,
                      installLinkedAgentIds: group.linkedAgentIds,
                      installReadOnlyAgentIds: group.readOnlyAgentIds,
                      previewNames: group.skills.map((skill) => skill.name),
                      createdAt: earliestSkillCreatedAt(group.skills),
                      updatedAt: latestSkillUpdatedAt(group.skills),
                      onOpen: () => setActiveFolderKey(group.relativePath),
                      onAddToCentral: group.skills.some((skill) => !skill.is_central)
                        ? () => void handleAddFolderToCentral(group)
                        : undefined,
                      addToCentralLabel: t("resource.addToCentralAction"),
                      onRemoveFromCentral: group.skills.every((skill) => skill.is_central)
                        ? () => void handleRemoveFolderFromCentral(group)
                        : undefined,
                      removeFromCentralLabel: t("resource.removeFromCentralAction"),
                      onUpdate: group.skills.some(isSourceBackedSkill)
                        ? () => void handleUpdateFolderSources(group)
                        : undefined,
                      updateLabel: t("resource.updateAction"),
                      isUpdating:
                        pendingFolderAction === "update" &&
                        pendingFolderActionKey === group.relativePath,
                      isRemovingFromCentral:
                        pendingFolderAction === "central" &&
                        pendingFolderActionKey === group.relativePath,
                      isAddingToCentral:
                        pendingFolderAction === "central" &&
                        pendingFolderActionKey === group.relativePath,
                      onInstall:
                        availableInstallAgents.length > 0
                          ? () => handleOpenInstallFolder(group)
                          : undefined,
                      installLabel: t("resource.installToTargetsAction"),
                      isInstalling:
                        pendingFolderAction === "install" &&
                        pendingFolderActionKey === group.relativePath,
                      onUninstall:
                        group.linkedAgentCount > 0
                          ? () => handleOpenUninstallFolder(group)
                          : undefined,
                      uninstallLabel: t("resource.uninstallFromTargetsAction"),
                      isUninstalling:
                        pendingFolderAction === "uninstall" &&
                        pendingFolderActionKey === group.relativePath,
                      onDelete: () => void handleDeleteFolderClick(group),
                      deleteLabel: t("resource.deleteAction"),
                    })
                  )}
                />
              </section>
            )}

            {filteredSkills.length === 0 && filteredFolders.length === 0 ? (
              <EmptyState message={t("resource.noMatch", { query: searchQuery })} />
            ) : filteredSkills.length > 0 ? (
              <section className="space-y-3">
                {viewMode === "folders" && activeFolder && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Blocks className="size-4 text-primary" />
                      <h2 className="text-sm font-semibold">
                        {activeFolder ? activeFolder.name : t("skillFolder.topLevelSkills")}
                      </h2>
                    </div>
                  </div>
                )}
                <SkillBrowserTable
                  kind="skill"
                  visibleColumns={visibleSkillColumns}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSortChange={(field, direction) => {
                    setSortField(field);
                    setSortDirection(direction);
                  }}
                  onToggleColumn={toggleSkillColumn}
                  onResetColumns={resetSkillColumns}
                  skills={sortedSkills.map((skill) => {
                    const normalizedSourceRepo = resourceSkillSourceRepo(skill);
                    return {
                      rowKey: skill.id,
                      name: skill.name,
                      description: skill.description,
                      notes: skill.notes,
                      publisher: normalizedSourceRepo ?? skill.source_author ?? undefined,
                      sourceAuthor: skill.source_author,
                      sourceRepo: normalizedSourceRepo,
                      sourceUrl: skill.source_url,
                      createdAt: skill.created_at,
                      updatedAt: skill.updated_at,
                      tags: (skill.tags ?? []).map((tag) => ({ key: tag, label: tag })),
                      onDetail: () => handleOpenDrawer(skill.id),
                      isCentral: skill.is_central,
                      installAgents: agents,
                      installLinkedAgentIds: skill.linked_agents,
                      installReadOnlyAgentIds: skill.read_only_agents ?? [],
                      onInstallTo:
                        skill.linked_agents.length === 0
                          ? () => handleInstallClick(skill)
                          : undefined,
                      installToLabel: t("resource.installToTargetsAction"),
                      onUninstallFromPlatform:
                        skill.linked_agents.length > 0
                          ? () => void handleUninstallFromAllTargets(skill)
                          : undefined,
                      uninstallFromLabel: t("resource.uninstallFromTargetsAction"),
                      onInstallToCentral: skill.is_central
                        ? undefined
                        : () => void handleAddToCentral(skill),
                      installToCentralLabel: t("resource.addToCentralAction"),
                      onRemoveFromCentral: skill.is_central
                        ? () => void handleRemoveFromCentral(skill)
                        : undefined,
                      removeFromCentralLabel: t("resource.removeFromCentralAction"),
                      onDeleteFromCentral: () => handleDeleteClick(skill),
                      deleteFromCentralLabel: t("resource.deleteAction"),
                      deleteFromCentralRequiresDialog:
                        skill.linked_agents.length > 0 || (skill.read_only_agents?.length ?? 0) > 0,
                      onUpdateFromSource:
                        isSourceBackedSkill(skill)
                          ? () => void handleUpdateSingleSource(skill)
                          : undefined,
                      updateFromSourceLabel: t("resource.updateAction"),
                      isLoading: updatingSkillId === skill.id || deletingSkillId === skill.id,
                      detailButtonRef: (node) => setDetailButtonRef(skill.id, node),
                      platformIcons: {
                        agents,
                        linkedAgents: skill.linked_agents,
                        readOnlyAgents: skill.read_only_agents ?? [],
                        skillId: skill.id,
                        onToggle: handleTogglePlatform,
                        togglingAgentId,
                      },
                    };
                  })}
                />
              </section>
            ) : null}
          </div>
        )}
      </div>

      <InstallDialog
        open={isInstallDialogOpen}
        onOpenChange={setIsInstallDialogOpen}
        skill={installTargetSkill}
        agents={availableInstallAgents}
        onInstall={async (skillId, agentIds, method) => {
          await handleInstall(skillId, agentIds, method);
        }}
      />

      <SkillDetailDrawer
        open={isDrawerOpen}
        skillId={drawerSkillId}
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) {
            setDrawerSkillId(null);
          }
        }}
        returnFocusRef={
          drawerSkillId
            ? {
                current: detailButtonRefs.current[drawerSkillId] ?? null,
              }
            : undefined
        }
      />

      <Dialog
        open={isRepositorySyncPreviewOpen}
        onOpenChange={(open) => {
          if (!open && !pendingRepositorySync) {
            setIsRepositorySyncPreviewOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("resource.repoSyncPreviewTitle")}</DialogTitle>
            <DialogDescription>{t("resource.repoSyncPreviewDesc")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
            {(repositorySyncPreview?.repositories ?? [])
              .filter(
                (repository) =>
                  repository.error ||
                  repository.added.length > 0 ||
                  repository.modified.length > 0 ||
                  repository.deleted.length > 0
              )
              .map((repository) => {
                const previewNames = [
                  ...repository.added,
                  ...repository.modified,
                  ...repository.deleted,
                ]
                  .slice(0, 6)
                  .map((item) => item.name)
                  .join(", ");
                return (
                  <section
                    key={repository.repository}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {repository.repository}
                        </div>
                        {previewNames ? (
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {previewNames}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1 text-xs">
                        {repository.added.length > 0 ? (
                          <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
                            {t("resource.repoSyncPreviewAdded", { count: repository.added.length })}
                          </span>
                        ) : null}
                        {repository.modified.length > 0 ? (
                          <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">
                            {t("resource.repoSyncPreviewModified", { count: repository.modified.length })}
                          </span>
                        ) : null}
                        {repository.deleted.length > 0 ? (
                          <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
                            {t("resource.repoSyncPreviewDeleted", { count: repository.deleted.length })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {repository.error ? (
                      <p className="mt-2 text-xs text-destructive">
                        {t("resource.repoSyncPreviewError", { error: repository.error })}
                      </p>
                    ) : null}
                  </section>
                );
              })}
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
            <Checkbox
              checked={removeRemoteDeleted}
              onCheckedChange={(checked) => setRemoveRemoteDeleted(!!checked)}
              className="mt-0.5"
            />
            <span className="text-muted-foreground">{t("resource.repoSyncRemoveDeleted")}</span>
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRepositorySyncPreviewOpen(false)}
              disabled={pendingRepositorySync}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void handleConfirmRepositorySync()}
              disabled={pendingRepositorySync}
            >
              {pendingRepositorySync ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {t("resource.repoSyncConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTargetSkill}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetSkill(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("resource.deleteConfirmTitle", { name: deleteTargetSkill?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {deleteTargetSkill
                ? t("resource.deleteLinkedWarning", {
                    platforms: linkedAgentNames(deleteTargetSkill).join(", "),
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTargetSkill(null)}
              disabled={!!deleteTargetSkill && deletingSkillId === deleteTargetSkill.id}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTargetSkill) {
                  void handleDeleteResourceSkill(deleteTargetSkill, true);
                }
              }}
              disabled={!!deleteTargetSkill && deletingSkillId === deleteTargetSkill.id}
            >
              {t("resource.deleteCascadeLabel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNpxImportOpen} onOpenChange={setIsNpxImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              {t("resource.npxImportTitle")}
              <HelpIcon label={t("common.info")} title={t("resource.npxImportDesc")} />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="npx-import-input" className="mb-1 block text-xs text-muted-foreground">
                {t("resource.npxImportInput")}
              </label>
              <Input
                id="npx-import-input"
                value={npxImportInput}
                onChange={(event) => setNpxImportInput(event.target.value)}
                placeholder="mattpocock/skills"
              />
            </div>
            <div>
              <label htmlFor="npx-import-skill" className="mb-1 block text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  {t("resource.npxImportSkill")}
                  <HelpIcon label={t("common.info")} title={t("resource.npxImportSkillHelp")} className="[&_svg]:size-3.5" />
                </span>
              </label>
              <Input
                id="npx-import-skill"
                value={npxImportSkill}
                onChange={(event) => setNpxImportSkill(event.target.value)}
                placeholder="ask-matt"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNpxImportOpen(false)} disabled={isNpxImporting}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleImportViaNpx()} disabled={!npxImportInput.trim() || isNpxImporting}>
              {isNpxImporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {t("resource.npxImportSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLocalAddOpen} onOpenChange={setIsLocalAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              {t("resource.localAddTitle")}
              <HelpIcon label={t("common.info")} title={t("resource.localAddDesc")} />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="local-source-dir" className="mb-1 block text-xs text-muted-foreground">
                {t("resource.localAddSourceDir")}
              </label>
              <div className="flex gap-2">
                <Input
                  id="local-source-dir"
                  value={localSourceDir}
                  onChange={(event) => setLocalSourceDir(normalizePathForInputDisplay(event.target.value))}
                  placeholder="D:\\Skills\\my-skill-pack"
                />
                <Button type="button" variant="outline" onClick={() => void handleChooseLocalSourceDir()}>
                  <FolderOpen className="size-4" />
                  {t("common.browse")}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLocalAddOpen(false)} disabled={isAddingLocal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleAddLocalSkills()} disabled={!localSourceDir.trim() || isAddingLocal}>
              {isAddingLocal ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t("resource.localAddSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={folderActionMode === "install"}
        onOpenChange={(open) => {
          if (!open && pendingFolderAction !== "install") {
            closeFolderActionDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("skillFolder.installFolderTitle", {
                name: folderActionGroup?.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("skillFolder.installFolderDesc", {
                count: folderActionGroup?.skills.length ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <InstallTargetList
              agents={availableInstallAgents}
              selectedAgentIds={folderInstallTargetIds}
              onToggleAgent={handleFolderInstallTargetChange}
              isCentral={folderActionGroup?.skills.every((skill) => skill.is_central) ?? false}
              emptyMessage={t("installDialog.noPlatforms")}
              ariaLabel={t("skillFolder.installTargetLabel")}
            />
            {availableInstallAgents.some(
              (agent) => agent.shares_central_skills && folderInstallTargetIds.has(agent.id)
            ) ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("installDialog.sharedPlatformHint")}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("installDialog.installMethod")}
              </label>
              <select
                value={folderInstallMethod}
                onChange={(event) =>
                  setFolderInstallMethod(event.target.value as "auto" | "symlink" | "copy")
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("installDialog.installMethod")}
              >
                <option value="auto">{t("installDialog.auto")}</option>
                <option value="symlink">{t("installDialog.symlink")}</option>
                <option value="copy">{t("installDialog.copy")}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeFolderActionDialog}
              disabled={pendingFolderAction === "install"}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void handleInstallFolderToTarget()}
              disabled={folderInstallTargetIds.size === 0 || pendingFolderAction !== null}
            >
              {pendingFolderAction === "install" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PackagePlus className="size-4" />
              )}
              {t("skillFolder.installFolder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={folderActionMode === "uninstall"}
        onOpenChange={(open) => {
          if (!open && pendingFolderAction !== "uninstall") {
            closeFolderActionDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("skillFolder.uninstallFolderTitle", {
                name: folderActionGroup?.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("skillFolder.uninstallFolderDesc", {
                count: folderActionGroup?.skills.length ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <InstallTargetList
            agents={folderActionUninstallAgents}
            selectedAgentIds={folderUninstallTargetIds}
            onToggleAgent={handleFolderUninstallTargetChange}
            emptyMessage={t("skillFolder.noUninstallTargets")}
            ariaLabel={t("skillFolder.uninstallTargetLabel")}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeFolderActionDialog}
              disabled={pendingFolderAction === "uninstall"}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleUninstallFolderFromTarget()}
              disabled={folderUninstallTargetIds.size === 0 || pendingFolderAction !== null}
            >
              {pendingFolderAction === "uninstall" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t("skillFolder.uninstallFolder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!folderDeletePreview}
        onOpenChange={(open) => {
          if (!open) {
            setFolderDeletePreview(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("resource.deleteFolderConfirmTitle", {
                name: folderDeletePreview?.bundle.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {folderDeletePreview
                ? t("resource.deleteFolderConfirmDesc", {
                    count: folderDeletePreview.skills.length,
                    platforms: folderDeletePreview.affectedAgents.join(", ") || t("common.none"),
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFolderDeletePreview(null)}
              disabled={isDeletingFolder}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDeleteFolder()}
              disabled={isDeletingFolder}
            >
              {folderDeletePreview?.affectedAgents.length
                ? t("resource.deleteFolderCascadeLabel")
                : t("resource.deleteFolderLabelShort")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
