import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  Blocks,
  Database,
  Download,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { InstallDialog } from "@/components/central/InstallDialog";
import { GitHubRepoImportWizard } from "@/components/marketplace/GitHubRepoImportWizard";
import { SkillDetailDrawer } from "@/components/skill/SkillDetailDrawer";
import { SkillFolderCard } from "@/components/skill/SkillFolderCard";
import { SkillListModeToggle } from "@/components/skill/SkillListModeToggle";
import { UnifiedSkillCard } from "@/components/skill/UnifiedSkillCard";
import { Button } from "@/components/ui/button";
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
import { isInstallTargetAgent } from "@/lib/agents";
import { formatPathForDisplay } from "@/lib/path";
import { buildSearchText, normalizeSearchQuery } from "@/lib/search";
import {
  dirnameFromSkillFile,
  normalizeFsPath,
  splitSkillsByTopLevel,
  type SkillFolderGroup,
} from "@/lib/skillFolders";
import { cn } from "@/lib/utils";
import { useMarketplaceStore } from "@/stores/marketplaceStore";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { usePlatformStore } from "@/stores/platformStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import { useSkillStore } from "@/stores/skillStore";
import type { CentralSkillBundleDeletePreview, SkillWithLinks } from "@/types";

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

function sortSkillsByName(skills: SkillWithLinks[]) {
  return [...skills].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
}

type ResourceSortField = "name" | "createdAt" | "updatedAt";
type ResourceSortDirection = "asc" | "desc";

function parseSortableTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getSkillSortTimestamp(
  skill: SkillWithLinks,
  field: "createdAt" | "updatedAt"
): number {
  return parseSortableTimestamp(
    field === "createdAt"
      ? skill.created_at ?? skill.scanned_at
      : skill.updated_at ?? skill.scanned_at
  );
}

function uniqueCount(values: Iterable<string>) {
  return new Set(values).size;
}

function resourceSourceFolderName(skill: SkillWithLinks): string | null {
  const repoOwner = skill.source_repo?.split("/").filter(Boolean)[0];
  return skill.source_author || repoOwner || null;
}

function resourceSourceFolderPath(rootPath: string, folderName: string, skill: SkillWithLinks) {
  if (rootPath) {
    return `${normalizeFsPath(rootPath)}/${folderName}`;
  }
  const candidatePath = normalizeFsPath(skill.canonical_path ?? dirnameFromSkillFile(skill.file_path));
  const marker = `/${folderName}/`;
  const markerIndex = candidatePath.toLowerCase().indexOf(marker.toLowerCase());
  if (markerIndex >= 0) {
    return candidatePath.slice(0, markerIndex + marker.length - 1);
  }
  return candidatePath;
}

export function splitResourceLibrarySkillsByFolder(
  skills: SkillWithLinks[],
  rootPath: string
) {
  const baseSplit = splitSkillsByTopLevel({
    skills,
    rootPath,
    getDirPaths: (skill) => [
      skill.canonical_path,
      dirnameFromSkillFile(skill.file_path),
    ],
    getLinkedAgentIds: (skill) => skill.linked_agents,
    getReadOnlyAgentIds: (skill) => skill.read_only_agents ?? [],
  });
  const rootSkills: SkillWithLinks[] = [];
  const groups = new Map<string, SkillFolderGroup<SkillWithLinks>>();

  for (const group of baseSplit.groups) {
    groups.set(group.relativePath, { ...group, skills: [...group.skills] });
  }

  for (const skill of baseSplit.rootSkills) {
    const folderName = resourceSourceFolderName(skill);
    if (!folderName) {
      rootSkills.push(skill);
      continue;
    }

    const groupKey = `source:${folderName.toLowerCase()}`;
    const group =
      groups.get(groupKey) ??
      {
        name: folderName,
        relativePath: groupKey,
        path: resourceSourceFolderPath(rootPath, folderName, skill),
        skillCount: 0,
        linkedAgentCount: 0,
        readOnlyAgentCount: 0,
        skills: [],
      };

    group.skills.push(skill);
    group.skills = sortSkillsByName(group.skills);
    group.skillCount = group.skills.length;
    group.linkedAgentCount = uniqueCount(
      group.skills.flatMap((item) => item.linked_agents)
    );
    group.readOnlyAgentCount = uniqueCount(
      group.skills.flatMap((item) => item.read_only_agents ?? [])
    );
    groups.set(groupKey, group);
  }

  return {
    rootSkills,
    groups: [...groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    ),
  };
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
  const togglePlatformLink = useResourceLibraryStore((state) => state.togglePlatformLink);
  const createManualSkill = useResourceLibraryStore((state) => state.createManualSkill);
  const previewDeleteResourceBundle = useResourceLibraryStore(
    (state) => state.previewDeleteResourceBundle
  );
  const deleteResourceBundle = useResourceLibraryStore((state) => state.deleteResourceBundle);
  const deleteResourceSkill = useResourceLibraryStore((state) => state.deleteResourceSkill);
  const updateSourceBackedSkills = useResourceLibraryStore(
    (state) => state.updateSourceBackedSkills
  );
  const updateSourceBackedSkill = useResourceLibraryStore(
    (state) => state.updateSourceBackedSkill
  );

  const refreshCounts = usePlatformStore((state) => state.refreshCounts);
  const loadCentralSkills = useCentralSkillsStore((state) => state.loadCentralSkills);
  const getSkillsByAgent = useSkillStore((state) => state.getSkillsByAgent);
  const skillsByAgent = useSkillStore((state) => state.skillsByAgent);
  const githubImport = useMarketplaceStore((state) => state.githubImport);
  const previewGitHubRepoImport = useMarketplaceStore(
    (state) => state.previewGitHubRepoImport
  );
  const importGitHubRepoSkills = useMarketplaceStore(
    (state) => state.importGitHubRepoSkills
  );
  const resetGitHubImport = useMarketplaceStore((state) => state.resetGitHubImport);

  const [viewMode, setViewMode] = useSkillListViewMode("resource-library");
  const [sortField, setSortField] = useState<ResourceSortField>("name");
  const [sortDirection, setSortDirection] = useState<ResourceSortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);
  const [installTargetSkill, setInstallTargetSkill] = useState<SkillWithLinks | null>(null);
  const [deleteTargetSkill, setDeleteTargetSkill] = useState<SkillWithLinks | null>(null);
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const [drawerSkillId, setDrawerSkillId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [updatingSkillId, setUpdatingSkillId] = useState<string | null>(null);
  const [isGitHubImportOpen, setIsGitHubImportOpen] = useState(false);
  const [isManualCreateOpen, setIsManualCreateOpen] = useState(false);
  const [manualSkillId, setManualSkillId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [folderDeletePreview, setFolderDeletePreview] =
    useState<CentralSkillBundleDeletePreview | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [githubRepoUrl, setGitHubRepoUrl] = useState("");
  const detailButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const effectiveSearchQuery = skills.length > 80 ? deferredSearchQuery : searchQuery;
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(effectiveSearchQuery),
    [effectiveSearchQuery]
  );
  const formattedResourceDir = formatPathForDisplay(resourceLibraryDir || t("resource.path"));

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
    viewMode === "folders" ? activeFolder?.skills ?? folderSplit.rootSkills : skills;
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
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredSkills].sort((a, b) => {
      const nameComparison = a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (sortField === "name") {
        return nameComparison * direction;
      }
      const timeComparison =
        getSkillSortTimestamp(a, sortField) - getSkillSortTimestamp(b, sortField);
      return timeComparison === 0 ? nameComparison : timeComparison * direction;
    });
  }, [filteredSkills, sortDirection, sortField]);

  const filteredFolders = useMemo(() => {
    if (viewMode !== "folders" || activeFolder) return [];
    return folderSplit.groups.filter((group) => {
      if (!normalizedSearchQuery) return true;
      return buildSearchText([
        group.name,
        group.path,
        ...group.skills.map((skill) => skill.name),
      ]).includes(normalizedSearchQuery);
    });
  }, [activeFolder, folderSplit.groups, normalizedSearchQuery, viewMode]);

  const availableInstallAgents = useMemo(
    () => agents.filter(isInstallTargetAgent),
    [agents]
  );
  const installableImportedSkills = useMemo(() => {
    if (!githubImport.importResult) return [];
    const importedIds = new Set(
      githubImport.importResult.importedSkills.map((skill) => skill.importedSkillId)
    );
    return skills.filter((skill) => importedIds.has(skill.id));
  }, [githubImport.importResult, skills]);

  const sortFieldOptions: Array<{ value: ResourceSortField; label: string }> = [
    { value: "name", label: t("central.sortByName") },
    { value: "createdAt", label: t("central.sortByCreatedAt") },
    { value: "updatedAt", label: t("central.sortByUpdatedAt") },
  ];

  const sortDirectionOptions: Array<{ value: ResourceSortDirection; label: string }> = [
    { value: "asc", label: t("central.sortAscending") },
    { value: "desc", label: t("central.sortDescending") },
  ];

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

  async function handleUpdateSources() {
    try {
      const updated = await updateSourceBackedSkills();
      toast.success(t("resource.updateSourcesSuccess", { count: updated.length }));
    } catch (err) {
      toast.error(t("resource.updateSourcesError", { error: String(err) }));
    }
  }

  async function handleUpdateSingleSource(skill: SkillWithLinks) {
    setUpdatingSkillId(skill.id);
    try {
      await updateSourceBackedSkill(skill.id);
      toast.success(t("central.updateSourceSuccess", { name: skill.name }));
    } catch (err) {
      toast.error(t("central.updateSourceError", { name: skill.name, error: String(err) }));
    } finally {
      setUpdatingSkillId(null);
    }
  }

  async function handleAddToCentral(skill: SkillWithLinks) {
    setUpdatingSkillId(skill.id);
    try {
      await addToCentral(skill.id);
      await Promise.all([loadCentralSkills(), refreshCounts()]);
      toast.success(t("resource.addToCentralSuccess", { name: skill.name }));
    } catch (err) {
      toast.error(t("resource.addToCentralError", { name: skill.name, error: String(err) }));
    } finally {
      setUpdatingSkillId(null);
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

  async function handleCreateManualSkill() {
    try {
      await createManualSkill({
        skillId: manualSkillId,
        name: manualName,
        description: manualDescription || null,
        body: manualBody || null,
      });
      setIsManualCreateOpen(false);
      setManualSkillId("");
      setManualName("");
      setManualDescription("");
      setManualBody("");
      toast.success(t("resource.manualCreateSuccess"));
    } catch (err) {
      toast.error(t("resource.manualCreateError", { error: String(err) }));
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

  async function handleGitHubPreview() {
    try {
      return await previewGitHubRepoImport(githubRepoUrl);
    } catch {
      return null;
    }
  }

  async function handleGitHubImport(
    selections: Parameters<typeof importGitHubRepoSkills>[1]
  ) {
    try {
      const result = await importGitHubRepoSkills(githubRepoUrl, selections);
      await Promise.all([loadResourceLibrary(), refreshCounts()]);
      toast.success(t("resource.githubImportSuccess"));
      return result;
    } catch (err) {
      toast.error(t("marketplace.installError", { error: String(err) }));
      throw err;
    }
  }

  async function handleInstallImportedSkill(
    skillId: string,
    agentIds: string[],
    method: "symlink" | "copy"
  ) {
    await handleInstall(skillId, agentIds, method);
    await Promise.all(agentIds.map((agentId) => getSkillsByAgent(agentId)));
  }

  async function handleAfterImportSuccess() {
    const agentIds = Object.keys(skillsByAgent);
    await Promise.all([
      loadResourceLibrary(),
      ...agentIds.map((agentId) => getSkillsByAgent(agentId)),
    ]);
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
          <p className="mt-0.5 text-sm text-muted-foreground">{formattedResourceDir}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleUpdateSources} disabled={isUpdatingSources}>
            {isUpdatingSources ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t("resource.updateSources")}
          </Button>
          <Button variant="outline" onClick={() => setIsGitHubImportOpen(true)}>
            <Download className="size-4" />
            {t("marketplace.githubImportSecondaryCta")}
          </Button>
          <Button variant="outline" onClick={() => setIsManualCreateOpen(true)}>
            <Plus className="size-4" />
            {t("resource.manualCreate")}
          </Button>
        </div>
      </div>

      <div className="border-b border-border px-6 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("resource.searchPlaceholder")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="bg-muted/40 pl-8"
              aria-label={t("resource.searchPlaceholder")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowUpDown className="size-3.5" />
              <span>{t("central.sortLabel")}</span>
            </div>
            <div
              role="group"
              aria-label={t("central.sortFieldLabel")}
              className="flex rounded-xl bg-muted/40 p-1"
            >
              {sortFieldOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={sortField === option.value}
                  onClick={() => setSortField(option.value)}
                  className={cn(
                    "h-7 rounded-lg px-3 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    sortField === option.value
                      ? "bg-background/95 text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div
              role="group"
              aria-label={t("central.sortDirectionLabel")}
              className="flex rounded-xl bg-muted/40 p-1"
            >
              {sortDirectionOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={sortDirection === option.value}
                  onClick={() => setSortDirection(option.value)}
                  className={cn(
                    "h-7 rounded-lg px-3 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    sortDirection === option.value
                      ? "bg-background/95 text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <SkillListModeToggle value={viewMode} onChange={setViewMode} />
          </div>
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
                <div className="flex items-center gap-2">
                  <FolderOpen className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">{t("skillFolder.foldersTitle")}</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {filteredFolders.map((group) => (
                    <SkillFolderCard
                      key={group.relativePath}
                      name={group.name}
                      path={group.path}
                      skillCount={group.skillCount}
                      linkedAgentCount={group.linkedAgentCount}
                      readOnlyAgentCount={group.readOnlyAgentCount}
                      previewNames={group.skills.map((skill) => skill.name)}
                      onOpen={() => setActiveFolderKey(group.relativePath)}
                      onDelete={() => void handleDeleteFolderClick(group)}
                      deleteLabel={t("resource.deleteFolderLabel", { name: group.name })}
                    />
                  ))}
                </div>
              </section>
            )}

            {filteredSkills.length === 0 && filteredFolders.length === 0 ? (
              <EmptyState message={t("resource.noMatch", { query: searchQuery })} />
            ) : filteredSkills.length > 0 ? (
              <section className="space-y-3">
                {viewMode === "folders" && (
                  <div className="flex items-center gap-2">
                    <Blocks className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold">
                      {activeFolder ? activeFolder.name : t("skillFolder.topLevelSkills")}
                    </h2>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {sortedSkills.map((skill) => (
                    <UnifiedSkillCard
                      key={skill.id}
                      name={skill.name}
                      description={skill.description}
                      publisher={skill.source_repo ?? skill.source_author ?? undefined}
                      sourceAuthor={skill.source_author}
                      sourceRepo={skill.source_repo}
                      sourceUrl={skill.source_url}
                      createdAt={skill.created_at}
                      updatedAt={skill.updated_at}
                      tags={(skill.tags ?? []).map((tag) => ({ key: tag, label: tag }))}
                      onDetail={() => handleOpenDrawer(skill.id)}
                      onInstallTo={() => handleInstallClick(skill)}
                      onInstallToCentral={() => void handleAddToCentral(skill)}
                      installToCentralLabel={t("resource.addToCentralLabel", { name: skill.name })}
                      onDeleteFromCentral={() => handleDeleteClick(skill)}
                      deleteFromCentralLabel={t("resource.deleteLabel", { name: skill.name })}
                      deleteFromCentralRequiresDialog={
                        skill.linked_agents.length > 0 || (skill.read_only_agents?.length ?? 0) > 0
                      }
                      onUpdateFromSource={
                        skill.source_url ? () => void handleUpdateSingleSource(skill) : undefined
                      }
                      updateFromSourceLabel={t("central.updateSourceLabel", { name: skill.name })}
                      isLoading={updatingSkillId === skill.id || deletingSkillId === skill.id}
                      detailButtonRef={(node) => setDetailButtonRef(skill.id, node)}
                      platformIcons={{
                        agents,
                        linkedAgents: skill.linked_agents,
                        readOnlyAgents: skill.read_only_agents ?? [],
                        skillId: skill.id,
                        onToggle: handleTogglePlatform,
                        togglingAgentId,
                      }}
                    />
                  ))}
                </div>
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

      <Dialog open={isManualCreateOpen} onOpenChange={setIsManualCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("resource.manualCreateTitle")}</DialogTitle>
            <DialogDescription>{t("resource.manualCreateDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="manual-skill-id" className="mb-1 block text-xs text-muted-foreground">
                {t("resource.manualSkillId")}
              </label>
              <Input
                id="manual-skill-id"
                value={manualSkillId}
                onChange={(event) => setManualSkillId(event.target.value)}
                placeholder="my-skill"
              />
            </div>
            <div>
              <label htmlFor="manual-skill-name" className="mb-1 block text-xs text-muted-foreground">
                {t("resource.manualSkillName")}
              </label>
              <Input
                id="manual-skill-name"
                value={manualName}
                onChange={(event) => setManualName(event.target.value)}
                placeholder="My Skill"
              />
            </div>
            <div>
              <label htmlFor="manual-skill-description" className="mb-1 block text-xs text-muted-foreground">
                {t("resource.manualSkillDescription")}
              </label>
              <Input
                id="manual-skill-description"
                value={manualDescription}
                onChange={(event) => setManualDescription(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="manual-skill-body" className="mb-1 block text-xs text-muted-foreground">
                {t("resource.manualSkillBody")}
              </label>
              <textarea
                id="manual-skill-body"
                value={manualBody}
                onChange={(event) => setManualBody(event.target.value)}
                className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManualCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleCreateManualSkill()}>
              {t("resource.manualCreateSubmit")}
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

      <GitHubRepoImportWizard
        open={isGitHubImportOpen}
        onOpenChange={setIsGitHubImportOpen}
        repoUrl={githubRepoUrl}
        onRepoUrlChange={setGitHubRepoUrl}
        preview={githubImport.preview}
        previewError={githubImport.error}
        isPreviewLoading={githubImport.isPreviewLoading}
        isImporting={githubImport.isImporting}
        importResult={githubImport.importResult}
        onPreview={handleGitHubPreview}
        onImport={handleGitHubImport}
        availableAgents={availableInstallAgents}
        installableSkills={installableImportedSkills}
        onInstallImportedSkill={handleInstallImportedSkill}
        onAfterImportSuccess={handleAfterImportSuccess}
        onReset={() => {
          resetGitHubImport();
          setGitHubRepoUrl("");
        }}
        launcherLabel={t("resource.title")}
      />
    </div>
  );
}
