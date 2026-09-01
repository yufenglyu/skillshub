import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Blocks,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { usePlatformStore } from "@/stores/platformStore";
import { OpenableDirectoryPath } from "@/components/common/OpenableDirectoryPath";
import { SkillDetailDrawer } from "@/components/skill/SkillDetailDrawer";
import { SkillBrowserTable, type FolderTableItem } from "@/components/skill/SkillBrowserTable";
import { SkillBrowserViewHeading } from "@/components/skill/SkillBrowserViewHeading";
import { InstallDialog } from "@/components/central/InstallDialog";
import { PlatformInstallDrawer } from "@/components/central/PlatformInstallDrawer";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentWithStatus, CentralSkillBundle, SkillWithLinks } from "@/types";
import { useSkillListViewMode } from "@/hooks/useSkillListViewMode";
import { useSkillTableColumns } from "@/hooks/useSkillTableColumns";
import { formatPathForDisplay } from "@/lib/path";
import { buildSearchText, normalizeSearchQuery } from "@/lib/search";
import { dirnameFromSkillFile, splitSkillsByTopLevel } from "@/lib/skillFolders";
import {
  getFolderSortTimestamp,
  sortBySkillBrowserOrder,
  type SkillSortDirection,
  type SkillSortField,
} from "@/lib/skillSort";
import { isTauriRuntime } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const BROWSER_FIXTURE_AGENTS: AgentWithStatus[] = [
  {
    id: "claude-code",
    display_name: "Claude Code",
    category: "coding",
    global_skills_dir: "/Users/browser/.claude/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "cursor",
    display_name: "Cursor",
    category: "coding",
    global_skills_dir: "/Users/browser/.cursor/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "central",
    display_name: "Shared Hub",
    category: "central",
    global_skills_dir: "/Users/browser/.agents/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
];

const BROWSER_FIXTURE_SKILLS: SkillWithLinks[] = [
  {
    id: "fixture-central-skill",
    name: "fixture-central-skill",
    description: "Browser validation fixture for Central and drawer entry flows.",
    file_path: "~/.agents/skills/fixture-central-skill/SKILL.md",
    canonical_path: "~/.agents/skills/fixture-central-skill",
    is_central: true,
    source: "browser-fixture",
    scanned_at: "2026-04-17T00:00:00.000Z",
    created_at: "2026-04-17T00:00:00.000Z",
    updated_at: "2026-04-17T00:00:00.000Z",
    linked_agents: ["claude-code"],
    read_only_agents: [],
  },
];

const EMPTY_SKILLS: SkillWithLinks[] = [];
const EMPTY_BUNDLES: CentralSkillBundle[] = [];
const EMPTY_AGENTS: AgentWithStatus[] = [];
const noopLoadCentralSkills = async () => {};
const noopLoadCentralBundles = async () => {};
const noopRefreshCounts = async () => {};
const noopTogglePlatformLink = async (_skillId: string, _agentId: string) => {};
const noopDeleteCentralSkill = async (
  _skillId: string,
  _options: { cascadeUninstall: boolean }
) => ({
  skillId: _skillId,
  removedCanonicalPath: "",
  uninstalledAgents: [],
  skippedReadOnlyAgents: [],
});
const noopPreviewDeleteCentralBundle = async (relativePath: string) => ({
  bundle: {
    name: relativePath,
    relativePath,
    path: "",
    isSymlink: false,
    skillCount: 0,
    linkedAgentCount: 0,
    readOnlyAgentCount: 0,
  },
  skills: [],
  affectedAgents: [],
  skippedReadOnlyAgents: [],
});
const noopDeleteCentralBundle = async (relativePath: string) => ({
  relativePath,
  removedBundlePath: "",
  removedKind: "directory",
  removedSkillIds: [],
  uninstalledAgents: [],
  skippedReadOnlyAgents: [],
});
const noopClearBundleDeletePreview = () => {};
const noopInstallSkill = async () => ({
  succeeded: [],
  failed: [],
});

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

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
      <div className="p-4 rounded-full bg-muted/60">
        <Blocks className="size-12 text-muted-foreground opacity-60" />
      </div>
      <p className="text-sm text-muted-foreground font-medium">{message}</p>
    </div>
  );
}

// ─── CentralSkillsView ────────────────────────────────────────────────────────

export function CentralSkillsView() {
  const { t } = useTranslation();
  const rawSkills = useCentralSkillsStore((state) => state.skills);
  const rawBundles = useCentralSkillsStore((state) => state.bundles);
  const rawAgents = useCentralSkillsStore((state) => state.agents);
  const rawIsLoading = useCentralSkillsStore((state) => state.isLoading);
  const rawLoadCentralSkills = useCentralSkillsStore(
    (state) => state.loadCentralSkills
  );
  const shouldUseBrowserFixtures =
    !isTauriRuntime() &&
    rawSkills === undefined &&
    rawAgents === undefined &&
    rawLoadCentralSkills === undefined;
  const skills = shouldUseBrowserFixtures
    ? BROWSER_FIXTURE_SKILLS
    : (rawSkills ?? EMPTY_SKILLS);
  const bundles = rawBundles ?? EMPTY_BUNDLES;
  const agents = shouldUseBrowserFixtures
    ? BROWSER_FIXTURE_AGENTS
    : (rawAgents ?? EMPTY_AGENTS);
  const centralAgentDir =
    agents.find((agent) => agent.id === "central")?.global_skills_dir ?? "";
  const centralSkillsRoot = centralAgentDir || t("central.path");
  const isLoading = shouldUseBrowserFixtures ? false : rawIsLoading ?? false;
  const loadCentralSkills = rawLoadCentralSkills ?? noopLoadCentralSkills;
  const loadCentralBundles =
    useCentralSkillsStore((state) => state.loadCentralBundles) ??
    noopLoadCentralBundles;
  const installSkill =
    useCentralSkillsStore((state) => state.installSkill) ?? noopInstallSkill;
  const togglePlatformLink =
    useCentralSkillsStore((state) => state.togglePlatformLink) ??
    noopTogglePlatformLink;
  const deleteCentralSkill =
    useCentralSkillsStore((state) => state.deleteCentralSkill) ??
    noopDeleteCentralSkill;
  const previewDeleteCentralBundle =
    useCentralSkillsStore((state) => state.previewDeleteCentralBundle) ??
    noopPreviewDeleteCentralBundle;
  const deleteCentralBundle =
    useCentralSkillsStore((state) => state.deleteCentralBundle) ??
    noopDeleteCentralBundle;
  const clearBundleDeletePreview =
    useCentralSkillsStore((state) => state.clearBundleDeletePreview) ??
    noopClearBundleDeletePreview;
  const bundleDeletePreview = useCentralSkillsStore(
    (state) => state.bundleDeletePreview
  );
  const togglingAgentId = useCentralSkillsStore((state) => state.togglingAgentId);
  const deletingSkillId = useCentralSkillsStore((state) => state.deletingSkillId);
  const deletingBundlePath = useCentralSkillsStore((state) => state.deletingBundlePath);

  // Keep the platform sidebar counts in sync after install.
  const refreshCounts =
    usePlatformStore((state) => state.refreshCounts) ?? noopRefreshCounts;

  const [viewMode, setViewMode] = useSkillListViewMode("central");
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
  const [installTargetSkill, setInstallTargetSkill] =
    useState<SkillWithLinks | null>(null);
  const [deleteTargetSkill, setDeleteTargetSkill] =
    useState<SkillWithLinks | null>(null);
  const [deleteTargetBundle, setDeleteTargetBundle] =
    useState<CentralSkillBundle | null>(null);
  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [drawerSkillId, setDrawerSkillId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [platformDrawerSkillId, setPlatformDrawerSkillId] = useState<string | null>(null);
  const [isPlatformDrawerOpen, setIsPlatformDrawerOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const detailButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const effectiveSearchQuery =
    skills.length > 80 ? deferredSearchQuery : searchQuery;
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(effectiveSearchQuery),
    [effectiveSearchQuery]
  );
  const centralFolderSplit = useMemo(
    () =>
      splitSkillsByTopLevel({
        skills,
        rootPath: centralSkillsRoot,
        getDirPaths: (skill) => [
          skill.canonical_path,
          dirnameFromSkillFile(skill.file_path),
        ],
        getLinkedAgentIds: (skill) => skill.linked_agents,
        getReadOnlyAgentIds: (skill) => skill.read_only_agents ?? [],
      }),
    [centralSkillsRoot, skills]
  );
  const centralFolderGroupsByPath = useMemo(
    () =>
      new Map(
        centralFolderSplit.groups.map((group) => [
          group.relativePath,
          group,
        ])
      ),
    [centralFolderSplit.groups]
  );
  const activeFolderGroup = activeFolderKey
    ? centralFolderGroupsByPath.get(activeFolderKey) ?? null
    : null;
  const activeBundle = activeFolderKey
    ? bundles.find((bundle) => bundle.relativePath === activeFolderKey) ?? null
    : null;
  const isFolderOpen = viewMode === "folders" && activeFolderKey !== null;
  const activeFolderName =
    activeFolderGroup?.name ?? activeBundle?.name ?? activeFolderKey;
  const searchableSkills = useMemo(() => {
    const visibleSkills =
      viewMode === "folders"
        ? isFolderOpen
          ? (activeFolderGroup?.skills ?? [])
          : centralFolderSplit.rootSkills
        : skills;

    return visibleSkills.map((skill) => ({
        skill,
        searchText: buildSearchText([
          skill.name,
          skill.description,
          skill.notes,
          ...(skill.tags ?? []),
          skill.source_author,
          skill.source_repo,
        ]),
      }));
  }, [activeFolderGroup?.skills, centralFolderSplit.rootSkills, isFolderOpen, skills, viewMode]);
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
  const isSearchActive = normalizedSearchQuery.length > 0;

  // Load central skills on mount.
  useEffect(() => {
    loadCentralSkills();
  }, [loadCentralSkills]);

  useEffect(() => {
    loadCentralBundles();
  }, [loadCentralBundles]);

  // Filter skills by search query.
  const filteredSkills = useMemo(() => {
    return searchableSkills
      .filter(({ skill }) => {
        if (!selectedTag) return true;
        return (skill.tags ?? []).some((tag) => tag.toLowerCase() === selectedTag);
      })
      .filter(({ searchText }) => !normalizedSearchQuery || searchText.includes(normalizedSearchQuery))
      .map(({ skill }) => skill);
  }, [normalizedSearchQuery, searchableSkills, selectedTag]);

  const filteredBundles = useMemo(() => {
    if (viewMode !== "folders" || isFolderOpen) return [];
    return bundles.filter((bundle) => {
      const group = centralFolderGroupsByPath.get(bundle.relativePath);
      if (selectedTag) {
        const hasSelectedTag =
          group?.skills.some((skill) =>
            (skill.tags ?? []).some((tag) => tag.toLowerCase() === selectedTag)
          ) ?? false;
        if (!hasSelectedTag) return false;
      }
      if (!normalizedSearchQuery) return true;
      const bundleSearchText = buildSearchText([bundle.name, bundle.relativePath, bundle.path]);
      if (bundleSearchText.includes(normalizedSearchQuery)) return true;
      return (
        group?.skills.some((skill) =>
          buildSearchText([
            skill.name,
            skill.description,
            skill.notes,
            ...(skill.tags ?? []),
            skill.source_author,
            skill.source_repo,
          ]).includes(normalizedSearchQuery)
        ) ?? false
      );
    });
  }, [bundles, centralFolderGroupsByPath, isFolderOpen, normalizedSearchQuery, selectedTag, viewMode]);

  const sortedSkills = useMemo(() => {
    return sortBySkillBrowserOrder(filteredSkills, sortField, sortDirection);
  }, [filteredSkills, sortDirection, sortField]);

  const sortedBundles = useMemo(() => {
    const multiplier = sortDirection === "asc" ? 1 : -1;
    return [...filteredBundles].sort((a, b) => {
      const nameComparison = a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (sortField === "name") {
        return nameComparison * multiplier;
      }
      if (sortField === "source") {
        return nameComparison * multiplier;
      }
      const aGroup = centralFolderGroupsByPath.get(a.relativePath);
      const bGroup = centralFolderGroupsByPath.get(b.relativePath);
      const timeComparison =
        (aGroup ? getFolderSortTimestamp(aGroup, sortField) : 0) -
        (bGroup ? getFolderSortTimestamp(bGroup, sortField) : 0);
      return timeComparison === 0 ? nameComparison : timeComparison * multiplier;
    });
  }, [centralFolderGroupsByPath, filteredBundles, sortDirection, sortField]);

  useEffect(() => {
    if (viewMode === "all") {
      setActiveFolderKey(null);
      return;
    }
    if (
      activeFolderKey &&
      !centralFolderGroupsByPath.has(activeFolderKey) &&
      !bundles.some((bundle) => bundle.relativePath === activeFolderKey)
    ) {
      setActiveFolderKey(null);
    }
  }, [activeFolderKey, bundles, centralFolderGroupsByPath, viewMode]);

  useEffect(() => {
    if (!isSearchActive || !contentRef.current) return;
    contentRef.current.scrollTop = 0;
  }, [isSearchActive, normalizedSearchQuery]);

  function agentDisplayNames(agentIds: string[]): string[] {
    const namesById = new Map(agents.map((agent) => [agent.id, agent.display_name]));
    return Array.from(new Set(agentIds)).map((agentId) => namesById.get(agentId) ?? agentId);
  }

  function linkedAgentNames(skill: SkillWithLinks): string[] {
    return agentDisplayNames([...skill.linked_agents, ...(skill.read_only_agents ?? [])]);
  }

  function setDetailButtonRef(skillId: string, node: HTMLButtonElement | null) {
    detailButtonRefs.current[skillId] = node;
  }

  function handleOpenDrawer(skillId: string) {
    setDrawerSkillId(skillId);
    setIsDrawerOpen(true);
  }

  function handleOpenPlatformDrawer(skillId: string) {
    setPlatformDrawerSkillId(skillId);
    setIsPlatformDrawerOpen(true);
  }

  async function handleTogglePlatform(skillId: string, agentId: string) {
    try {
      await togglePlatformLink(skillId, agentId);
      await refreshCounts();
    } catch (err) {
      toast.error(t("central.installError", { error: String(err) }));
    }
  }

  async function handleInstall(skillId: string, agentIds: string[], method: string) {
    try {
      const result = await installSkill(skillId, agentIds, method);
      // Refresh sidebar counts after install.
      await refreshCounts();
      if (result.failed.length > 0) {
        const failedNames = result.failed.map((f) => f.agent_id).join(", ");
        toast.error(t("central.installPartialFail", { platforms: failedNames }));
      }
    } catch (err) {
      toast.error(t("central.installError", { error: String(err) }));
    }
  }

  async function handleDeleteCentralSkill(skill: SkillWithLinks, cascadeUninstall: boolean) {
    try {
      await deleteCentralSkill(skill.id, { cascadeUninstall });
      await refreshCounts();
      toast.success(t("central.deleteSuccess", { name: skill.name }));
      setDeleteTargetSkill(null);
    } catch (err) {
      toast.error(t("central.deleteError", { error: String(err) }));
    }
  }

  function handleDeleteClick(skill: SkillWithLinks) {
    if (skill.linked_agents.length > 0 || (skill.read_only_agents?.length ?? 0) > 0) {
      setDeleteTargetSkill(skill);
      return;
    }

    void handleDeleteCentralSkill(skill, false);
  }

  async function handleDeleteBundleClick(bundle: CentralSkillBundle) {
    try {
      await previewDeleteCentralBundle(bundle.relativePath);
      setDeleteTargetBundle(bundle);
    } catch (err) {
      toast.error(t("central.deleteBundlePreviewError", { error: String(err) }));
    }
  }

  async function handleDeleteCentralBundle(bundle: CentralSkillBundle) {
    try {
      await deleteCentralBundle(bundle.relativePath, { cascadeUninstall: true });
      await refreshCounts();
      toast.success(t("central.deleteBundleSuccess", { name: bundle.name }));
      setDeleteTargetBundle(null);
      clearBundleDeletePreview();
      if (activeFolderKey === bundle.relativePath) {
        setActiveFolderKey(null);
      }
    } catch (err) {
      toast.error(t("central.deleteBundleError", { error: String(err) }));
    }
  }

  async function handleRefresh() {
    try {
      // Re-scan the filesystem first so new/removed skills are picked up,
      // then reload central skills from the (now-updated) database.
      await refreshCounts();
      await Promise.all([loadCentralSkills(), loadCentralBundles()]);
    } catch (err) {
      toast.error(t("central.refreshError", { error: String(err) }));
    }
  }

  const platformDrawerSkill = useMemo(
    () => skills.find((skill) => skill.id === platformDrawerSkillId) ?? null,
    [platformDrawerSkillId, skills]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{t("central.title")}</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isLoading}
              aria-label={t("central.refresh")}
            >
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <OpenableDirectoryPath
            path={centralAgentDir}
            displayPath={centralSkillsRoot}
          />
        </div>
      </div>

      {/* Search bar */}
      <div className="px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <SearchInput
            placeholder={t("central.searchPlaceholder")}
            value={searchQuery}
            onValueChange={setSearchQuery}
            aria-label={t("central.searchPlaceholder")}
            containerClassName="min-w-0 flex-1"
          />
          <SkillBrowserViewHeading
            value={viewMode}
            onChange={setViewMode}
            className="shrink-0"
          />
        </div>
        {availableTags.length > 0 && (
          <div
            role="group"
            aria-label={t("central.tagFilter")}
            className="mt-3 flex flex-wrap items-center gap-1.5"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {t("central.tagFilter")}
            </span>
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

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <EmptyState message={t("central.loading")} />
        ) : skills.length === 0 && bundles.length === 0 ? (
          <EmptyState message={t("central.noSkills")} />
        ) : (
          <div className="space-y-6">
            {viewMode === "folders" && isFolderOpen && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setActiveFolderKey(null)}>
                  <ArrowLeft className="size-4" />
                  {t("resource.backToFolders")}
                </Button>
                <span className="text-sm font-medium text-muted-foreground">
                  {activeFolderName}
                </span>
              </div>
            )}

            {viewMode === "folders" && !isFolderOpen && sortedBundles.length > 0 && (
              <section aria-label={t("central.bundlesSectionLabel")} className="space-y-3">
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
                  folders={sortedBundles.map((bundle): FolderTableItem => {
                    const group = centralFolderGroupsByPath.get(bundle.relativePath);
                    const groupSkills = group?.skills ?? [];
                    return {
                      key: bundle.relativePath,
                      name: bundle.name,
                      path: bundle.path,
                      skillCount: bundle.skillCount,
                      installAgents: agents,
                      installLinkedAgentIds: group?.linkedAgentIds ?? [],
                      installReadOnlyAgentIds: group?.readOnlyAgentIds ?? [],
                      previewNames: groupSkills.map((skill) => skill.name),
                      createdAt: earliestSkillCreatedAt(groupSkills),
                      updatedAt: latestSkillUpdatedAt(groupSkills),
                      onOpen: () => setActiveFolderKey(bundle.relativePath),
                      onDelete: () => void handleDeleteBundleClick(bundle),
                      deleteLabel: t("resource.deleteAction"),
                      isDeleting: deletingBundlePath === bundle.relativePath,
                    };
                  })}
                />
              </section>
            )}

            {filteredSkills.length === 0 && sortedBundles.length === 0 ? (
              <EmptyState message={t("central.noMatch", { query: searchQuery })} />
            ) : filteredSkills.length > 0 ? (
              <section className="space-y-3">
                {viewMode === "folders" && (
                  <div className="flex items-center gap-2">
                    <Blocks className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold">
                      {isFolderOpen ? activeFolderName : t("skillFolder.topLevelSkills")}
                    </h2>
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
                  skills={sortedSkills.map((skill) => ({
                    rowKey: skill.id,
                    name: skill.name,
                    description: skill.description,
                    notes: skill.notes,
                    publisher: skill.source_repo ?? skill.source_author ?? undefined,
                    sourceAuthor: skill.source_author,
                    sourceRepo: skill.source_repo,
                    sourceUrl: skill.source_url,
                    createdAt: skill.created_at,
                    updatedAt: skill.updated_at,
                    tags: (skill.tags ?? []).map((tag) => ({ key: tag, label: tag })),
                    onDetail: () => handleOpenDrawer(skill.id),
                    onDeleteFromCentral: () => handleDeleteClick(skill),
                    deleteFromCentralLabel: t("resource.deleteAction"),
                    deleteFromCentralRequiresDialog:
                      skill.linked_agents.length > 0 || (skill.read_only_agents?.length ?? 0) > 0,
                    isLoading: deletingSkillId === skill.id,
                    detailButtonRef: (node) => setDetailButtonRef(skill.id, node),
                    installAgents: agents,
                    installLinkedAgentIds: skill.linked_agents,
                    installReadOnlyAgentIds: skill.read_only_agents ?? [],
                    platformIcons: {
                      agents,
                      linkedAgents: skill.linked_agents,
                      readOnlyAgents: skill.read_only_agents ?? [],
                      skillId: skill.id,
                      onToggle: handleTogglePlatform,
                      onManage: () => handleOpenPlatformDrawer(skill.id),
                      togglingAgentId,
                    },
                  }))}
                />
              </section>
            ) : null}
          </div>
        )}
      </div>

      {/* Install Dialog */}
      <InstallDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        skill={installTargetSkill}
        agents={agents}
        onInstall={handleInstall}
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

      <PlatformInstallDrawer
        open={isPlatformDrawerOpen}
        skill={platformDrawerSkill}
        agents={agents}
        togglingAgentId={togglingAgentId}
        onOpenChange={(open) => {
          setIsPlatformDrawerOpen(open);
          if (!open) {
            setPlatformDrawerSkillId(null);
          }
        }}
        onToggle={handleTogglePlatform}
        onOpenInstallDialog={() => {
          if (platformDrawerSkill) {
            setInstallTargetSkill(platformDrawerSkill);
            setIsPlatformDrawerOpen(false);
            setPlatformDrawerSkillId(null);
            setIsDialogOpen(true);
          }
        }}
      />

      <Dialog
        open={!!deleteTargetSkill}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetSkill(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("central.deleteConfirmTitle", { name: deleteTargetSkill?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {deleteTargetSkill
                ? t("central.deleteLinkedWarning", {
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
                  void handleDeleteCentralSkill(deleteTargetSkill, true);
                }
              }}
              disabled={!!deleteTargetSkill && deletingSkillId === deleteTargetSkill.id}
            >
              {t("central.deleteCascadeLabel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTargetBundle}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetBundle(null);
            clearBundleDeletePreview();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("central.deleteBundleConfirmTitle", {
                name: deleteTargetBundle?.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {bundleDeletePreview?.bundle.isSymlink
                ? t("central.deleteBundleSymlinkWarning", {
                    path: formatPathForDisplay(
                      bundleDeletePreview.bundle.path || deleteTargetBundle?.path || ""
                    ),
                  })
                : t("central.deleteBundleDirectoryWarning", {
                    path: formatPathForDisplay(
                      bundleDeletePreview?.bundle.path || deleteTargetBundle?.path || ""
                    ),
                  })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="size-4" />
                {t("central.deleteBundleDangerTitle")}
              </div>
              <p className="mt-1 text-muted-foreground">
                {t("central.deleteBundleDangerDescription", {
                  count:
                    bundleDeletePreview?.bundle.skillCount ??
                    deleteTargetBundle?.skillCount ??
                    0,
                })}
              </p>
            </div>

            {bundleDeletePreview && (
              <div className="space-y-2">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">
                    {t("central.deleteBundleSkillsLabel")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {bundleDeletePreview.skills.map((skill) => (
                      <span
                        key={skill.id}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs"
                      >
                        {skill.name}
                      </span>
                    ))}
                  </div>
                </div>

                {bundleDeletePreview.affectedAgents.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      {t("central.deleteBundleAgentsLabel")}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {agentDisplayNames(bundleDeletePreview.affectedAgents).join(", ")}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTargetBundle(null);
                clearBundleDeletePreview();
              }}
              disabled={
                !!deleteTargetBundle &&
                deletingBundlePath === deleteTargetBundle.relativePath
              }
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTargetBundle) {
                  void handleDeleteCentralBundle(deleteTargetBundle);
                }
              }}
              disabled={
                !bundleDeletePreview ||
                (!!deleteTargetBundle &&
                  deletingBundlePath === deleteTargetBundle.relativePath)
              }
            >
              {t("central.deleteBundleCascadeLabel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
