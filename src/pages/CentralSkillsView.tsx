import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Blocks,
  Download,
  FolderOpen,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { usePlatformStore } from "@/stores/platformStore";
import { useSkillStore } from "@/stores/skillStore";
import { UnifiedSkillCard } from "@/components/skill/UnifiedSkillCard";
import { SkillDetailDrawer } from "@/components/skill/SkillDetailDrawer";
import { SkillFolderCard } from "@/components/skill/SkillFolderCard";
import { SkillListModeToggle } from "@/components/skill/SkillListModeToggle";
import { InstallDialog } from "@/components/central/InstallDialog";
import { CentralBundleDrawer } from "@/components/central/CentralBundleDrawer";
import { PlatformInstallDrawer } from "@/components/central/PlatformInstallDrawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentWithStatus, CentralSkillBundle, ScannedSkill, SkillWithLinks } from "@/types";
import { GitHubRepoImportWizard } from "@/components/marketplace/GitHubRepoImportWizard";
import { useMarketplaceStore } from "@/stores/marketplaceStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import { useSkillListViewMode } from "@/hooks/useSkillListViewMode";
import { formatPathForDisplay } from "@/lib/path";
import { buildSearchText, normalizeSearchQuery } from "@/lib/search";
import { dirnameFromSkillFile, splitSkillsByTopLevel } from "@/lib/skillFolders";
import { isTauriRuntime } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { isInstallTargetAgent } from "@/lib/agents";

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
    display_name: "Central Skills",
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
const EMPTY_SKILLS_BY_AGENT: Record<string, ScannedSkill[]> = {};
const EMPTY_GITHUB_IMPORT_STATE = {
  isPreviewLoading: false,
  isImporting: false,
  preview: null,
  importResult: null,
  previewedRepoUrl: null,
  error: null,
};
const noopLoadCentralSkills = async () => {};
const noopLoadCentralBundles = async () => {};
const noopRefreshCounts = async () => {};
const noopGetSkillsByAgent = async (_agentId: string) => {};
const noopPreviewGitHubRepoImport = async () => null;
const noopResetGitHubImport = () => {};
const noopTogglePlatformLink = async (_skillId: string, _agentId: string) => {};
const noopUninstallSkillsFromAgent = async (_skillIds: string[], _agentId: string) => {};
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
const noopLoadCentralBundleDetail = async (relativePath: string) => ({
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
});
const noopClearCentralBundleDetail = () => {};
const noopClearBundleDeletePreview = () => {};
const noopInstallSkill = async () => ({
  succeeded: [],
  failed: [],
});
const noopImportGitHubRepoSkills = async () => {
  throw new Error("GitHub import is unavailable");
};

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
  const updateSourceBackedSkill = useCentralSkillsStore(
    (state) => state.updateSourceBackedSkill
  ) ?? (async (skillId: string) => skillId);
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
  const centralSkillsRoot =
    agents.find((agent) => agent.id === "central")?.global_skills_dir ?? t("central.path");
  const centralSkillsDir = formatPathForDisplay(centralSkillsRoot);
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
  const uninstallSkillsFromAgent =
    useCentralSkillsStore((state) => state.uninstallSkillsFromAgent) ??
    noopUninstallSkillsFromAgent;
  const deleteCentralSkill =
    useCentralSkillsStore((state) => state.deleteCentralSkill) ??
    noopDeleteCentralSkill;
  const previewDeleteCentralBundle =
    useCentralSkillsStore((state) => state.previewDeleteCentralBundle) ??
    noopPreviewDeleteCentralBundle;
  const deleteCentralBundle =
    useCentralSkillsStore((state) => state.deleteCentralBundle) ??
    noopDeleteCentralBundle;
  const loadCentralBundleDetail =
    useCentralSkillsStore((state) => state.loadCentralBundleDetail) ??
    noopLoadCentralBundleDetail;
  const clearCentralBundleDetail =
    useCentralSkillsStore((state) => state.clearCentralBundleDetail) ??
    noopClearCentralBundleDetail;
  const bundleDetail = useCentralSkillsStore((state) => state.bundleDetail);
  const loadingBundleDetailPath = useCentralSkillsStore(
    (state) => state.loadingBundleDetailPath
  );
  const clearBundleDeletePreview =
    useCentralSkillsStore((state) => state.clearBundleDeletePreview) ??
    noopClearBundleDeletePreview;
  const bundleDeletePreview = useCentralSkillsStore(
    (state) => state.bundleDeletePreview
  );
  const togglingAgentId = useCentralSkillsStore((state) => state.togglingAgentId);
  const deletingSkillId = useCentralSkillsStore((state) => state.deletingSkillId);
  const deletingBundlePath = useCentralSkillsStore((state) => state.deletingBundlePath);
  const isUpdatingSources = useCentralSkillsStore((state) => state.isUpdatingSources);
  const updateSourceBackedSkills = useCentralSkillsStore(
    (state) => state.updateSourceBackedSkills
  ) ?? (async () => []);
  const loadResourceLibrary = useResourceLibraryStore(
    (state) => state.loadResourceLibrary
  ) ?? (async () => {});
  const resourceSkills =
    useResourceLibraryStore((state) => state.skills) ?? EMPTY_SKILLS;
  const resourceAgents =
    useResourceLibraryStore((state) => state.agents) ?? EMPTY_AGENTS;
  const installResourceSkill =
    useResourceLibraryStore((state) => state.installSkill) ?? noopInstallSkill;

  // Keep the platform sidebar counts in sync after install.
  const refreshCounts =
    usePlatformStore((state) => state.refreshCounts) ?? noopRefreshCounts;
  const platformAgents = usePlatformStore((state) => state.agents) ?? EMPTY_AGENTS;
  const skillsByAgent =
    useSkillStore((state) => state.skillsByAgent) ?? EMPTY_SKILLS_BY_AGENT;
  const getSkillsByAgent =
    useSkillStore((state) => state.getSkillsByAgent) ?? noopGetSkillsByAgent;
  const githubImport =
    useMarketplaceStore((state) => state.githubImport) ?? EMPTY_GITHUB_IMPORT_STATE;
  const previewGitHubRepoImport =
    useMarketplaceStore((state) => state.previewGitHubRepoImport) ??
    noopPreviewGitHubRepoImport;
  const importGitHubRepoSkills =
    useMarketplaceStore((state) => state.importGitHubRepoSkills) ??
    noopImportGitHubRepoSkills;
  const resetGitHubImport =
    useMarketplaceStore((state) => state.resetGitHubImport) ?? noopResetGitHubImport;

  type SortField = "name" | "createdAt" | "updatedAt";
  type SortDirection = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [viewMode, setViewMode] = useSkillListViewMode("central");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [updatingSkillId, setUpdatingSkillId] = useState<string | null>(null);
  const [selectedCentralSkillIds, setSelectedCentralSkillIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkUninstallAgentId, setBulkUninstallAgentId] = useState("");
  const [isBulkUninstallConfirming, setIsBulkUninstallConfirming] = useState(false);
  const [isBulkUninstalling, setIsBulkUninstalling] = useState(false);
  const [installTargetSkill, setInstallTargetSkill] =
    useState<SkillWithLinks | null>(null);
  const [deleteTargetSkill, setDeleteTargetSkill] =
    useState<SkillWithLinks | null>(null);
  const [deleteTargetBundle, setDeleteTargetBundle] =
    useState<CentralSkillBundle | null>(null);
  const [isBundleDrawerOpen, setIsBundleDrawerOpen] = useState(false);
  const [bundleDrawerPath, setBundleDrawerPath] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [drawerSkillId, setDrawerSkillId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [platformDrawerSkillId, setPlatformDrawerSkillId] = useState<string | null>(null);
  const [isPlatformDrawerOpen, setIsPlatformDrawerOpen] = useState(false);
  const [isGitHubImportOpen, setIsGitHubImportOpen] = useState(false);
  const [githubRepoUrl, setGitHubRepoUrl] = useState("");
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
  const visibleSkills = viewMode === "folders" ? centralFolderSplit.rootSkills : skills;
  const searchableSkills = useMemo(
    () =>
      visibleSkills.map((skill) => ({
        skill,
        searchText: buildSearchText([
          skill.name,
          skill.description,
          skill.notes,
          ...(skill.tags ?? []),
          skill.source_author,
          skill.source_repo,
        ]),
      })),
    [visibleSkills]
  );
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
    if (viewMode !== "folders") return [];
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
  }, [bundles, centralFolderGroupsByPath, normalizedSearchQuery, selectedTag, viewMode]);

  // Sort filtered skills.
  const sortedSkills = useMemo(() => {
    const list = [...filteredSkills];
    const direction = sortDirection === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const nameComparison = a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });

      if (sortField === "name") {
        return nameComparison * direction;
      }

      const leftTime = getSkillSortTimestamp(a, sortField);
      const rightTime = getSkillSortTimestamp(b, sortField);
      const timeComparison = leftTime - rightTime;

      return timeComparison === 0 ? nameComparison : timeComparison * direction;
    });
  }, [filteredSkills, sortDirection, sortField]);

  const uninstallTargetAgents = useMemo(
    () => agents.filter(isInstallTargetAgent),
    [agents]
  );
  const visibleUninstallableSkills = useMemo(
    () => sortedSkills.filter((skill) => skill.linked_agents.length > 0),
    [sortedSkills]
  );
  const selectedCentralSkills = useMemo(
    () => skills.filter((skill) => selectedCentralSkillIds.has(skill.id)),
    [selectedCentralSkillIds, skills]
  );
  const selectedLinkedSkillIdsForAgent = useMemo(
    () =>
      selectedCentralSkills
        .filter(
          (skill) =>
            bulkUninstallAgentId.length > 0 &&
            skill.linked_agents.includes(bulkUninstallAgentId)
        )
        .map((skill) => skill.id),
    [bulkUninstallAgentId, selectedCentralSkills]
  );
  const allVisibleUninstallableSelected =
    visibleUninstallableSkills.length > 0 &&
    visibleUninstallableSkills.every((skill) =>
      selectedCentralSkillIds.has(skill.id)
    );
  const skippedSelectedCount =
    selectedCentralSkillIds.size - selectedLinkedSkillIdsForAgent.length;

  useEffect(() => {
    setSelectedCentralSkillIds((current) => {
      const validIds = new Set(skills.map((skill) => skill.id));
      const next = new Set([...current].filter((skillId) => validIds.has(skillId)));
      return next.size === current.size ? current : next;
    });
  }, [skills]);

  useEffect(() => {
    setIsBulkUninstallConfirming(false);
  }, [bulkUninstallAgentId, selectedCentralSkillIds]);

  useEffect(() => {
    if (!isSearchActive || !contentRef.current) return;
    contentRef.current.scrollTop = 0;
  }, [isSearchActive, normalizedSearchQuery]);

  function handleInstallClick(skill: SkillWithLinks) {
    setInstallTargetSkill(skill);
    setIsDialogOpen(true);
  }

  function agentDisplayNames(agentIds: string[]): string[] {
    const namesById = new Map(agents.map((agent) => [agent.id, agent.display_name]));
    return Array.from(new Set(agentIds)).map((agentId) => namesById.get(agentId) ?? agentId);
  }

  function linkedAgentNames(skill: SkillWithLinks): string[] {
    return agentDisplayNames([...skill.linked_agents, ...(skill.read_only_agents ?? [])]);
  }

  const sortFieldOptions: Array<{ value: SortField; label: string }> = [
    { value: "name", label: t("central.sortByName") },
    { value: "createdAt", label: t("central.sortByCreatedAt") },
    { value: "updatedAt", label: t("central.sortByUpdatedAt") },
  ];

  const sortDirectionOptions: Array<{ value: SortDirection; label: string }> = [
    { value: "asc", label: t("central.sortAscending") },
    { value: "desc", label: t("central.sortDescending") },
  ];

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

  async function handleOpenBundleDrawer(bundle: CentralSkillBundle) {
    setBundleDrawerPath(bundle.relativePath);
    setIsBundleDrawerOpen(true);
    try {
      await loadCentralBundleDetail(bundle.relativePath);
    } catch (err) {
      setIsBundleDrawerOpen(false);
      setBundleDrawerPath(null);
      toast.error(t("central.bundleDetailError", { error: String(err) }));
    }
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

  function toggleCentralSkillSelection(skill: SkillWithLinks) {
    if (skill.linked_agents.length === 0) return;
    setSelectedCentralSkillIds((current) => {
      const next = new Set(current);
      if (next.has(skill.id)) {
        next.delete(skill.id);
      } else {
        next.add(skill.id);
      }
      return next;
    });
  }

  function toggleVisibleUninstallableSelection() {
    setSelectedCentralSkillIds((current) => {
      const next = new Set(current);
      if (allVisibleUninstallableSelected) {
        for (const skill of visibleUninstallableSkills) {
          next.delete(skill.id);
        }
      } else {
        for (const skill of visibleUninstallableSkills) {
          next.add(skill.id);
        }
      }
      return next;
    });
  }

  async function handleBulkUninstallFromAgent() {
    if (!bulkUninstallAgentId || selectedLinkedSkillIdsForAgent.length === 0) {
      return;
    }
    setIsBulkUninstalling(true);
    try {
      await uninstallSkillsFromAgent(selectedLinkedSkillIdsForAgent, bulkUninstallAgentId);
      await Promise.all([refreshCounts(), getSkillsByAgent(bulkUninstallAgentId)]);
      setSelectedCentralSkillIds(new Set());
      setIsBulkUninstallConfirming(false);
      toast.success(
        t("central.bulkUninstallSuccess", {
          count: selectedLinkedSkillIdsForAgent.length,
        })
      );
    } catch (err) {
      toast.error(t("central.bulkUninstallError", { error: String(err) }));
    } finally {
      setIsBulkUninstalling(false);
    }
  }

  async function handleUpdateSources() {
    try {
      const updated = await updateSourceBackedSkills();
      await refreshCounts();
      toast.success(t("central.updateSourcesSuccess", { count: updated.length }));
    } catch (err) {
      toast.error(t("central.updateSourcesError", { error: String(err) }));
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
      await Promise.all([refreshCounts(), loadCentralSkills(), loadResourceLibrary()]);
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
    const result = await installResourceSkill(skillId, agentIds, method);
    if (result.failed.length > 0) {
      toast.error(
        t("central.installPartialFail", {
          platforms: result.failed.map((item) => item.agent_id).join(", "),
        })
      );
    }
    await Promise.all([
      refreshCounts(),
      loadResourceLibrary(),
      ...agentIds.map((agentId) => getSkillsByAgent(agentId)),
    ]);
  }

  const installableImportedSkills = useMemo(() => {
    if (!githubImport.importResult) return [];
    const importedIds = new Set(
      githubImport.importResult.importedSkills.map((skill) => skill.importedSkillId)
    );
    return resourceSkills.filter((skill) => importedIds.has(skill.id));
  }, [githubImport.importResult, resourceSkills]);

  const availableInstallAgents = useMemo(
    () => (resourceAgents.length > 0 ? resourceAgents : agents.length > 0 ? agents : platformAgents),
    [agents, platformAgents, resourceAgents]
  );
  const platformDrawerSkill = useMemo(
    () => skills.find((skill) => skill.id === platformDrawerSkillId) ?? null,
    [platformDrawerSkillId, skills]
  );

  async function handleAfterImportSuccess() {
    const agentIds = Object.keys(skillsByAgent);
    await Promise.all([
      loadResourceLibrary(),
      ...agentIds.map((agentId) => getSkillsByAgent(agentId)),
    ]);
  }

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
          <p className="text-sm text-muted-foreground mt-0.5">
            {centralSkillsDir}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleUpdateSources}
            disabled={isUpdatingSources}
          >
            {isUpdatingSources ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {t("central.updateSources")}
          </Button>
          <Button variant="outline" onClick={() => setIsGitHubImportOpen(true)}>
            {t("marketplace.githubImportSecondaryCta")}
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-6 py-3 border-b border-border">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("central.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 bg-muted/40"
              aria-label={t("central.searchPlaceholder")}
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
                    "h-7 rounded-lg px-3 text-xs font-medium transition-colors cursor-pointer",
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
                    "h-7 rounded-lg px-3 text-xs font-medium transition-colors cursor-pointer",
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
        {skills.length > 0 && (
          <div
            role="group"
            aria-label={t("central.bulkUninstallLabel")}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={visibleUninstallableSkills.length === 0 || isBulkUninstalling}
              onClick={toggleVisibleUninstallableSelection}
              className="h-8"
            >
              {allVisibleUninstallableSelected
                ? t("central.deselectVisible")
                : t("central.selectVisible")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("central.selectedCount", { count: selectedCentralSkillIds.size })}
            </span>
            <label className="sr-only" htmlFor="central-bulk-uninstall-agent">
              {t("central.bulkUninstallPlatformLabel")}
            </label>
            <select
              id="central-bulk-uninstall-agent"
              aria-label={t("central.bulkUninstallPlatformLabel")}
              value={bulkUninstallAgentId}
              disabled={isBulkUninstalling}
              onChange={(event) => setBulkUninstallAgentId(event.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t("central.bulkUninstallChoosePlatform")}</option>
              {uninstallTargetAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.display_name}
                </option>
              ))}
            </select>
            {visibleUninstallableSkills.length === 0 && (
              <span className="text-xs text-muted-foreground">
                {t("central.bulkUninstallNoInstalled")}
              </span>
            )}
            {bulkUninstallAgentId &&
              selectedCentralSkillIds.size > 0 &&
              skippedSelectedCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t("central.bulkUninstallSkipped", { count: skippedSelectedCount })}
                </span>
              )}
            {selectedLinkedSkillIdsForAgent.length > 0 &&
              (isBulkUninstallConfirming ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isBulkUninstalling}
                    onClick={() => void handleBulkUninstallFromAgent()}
                    className="h-8 gap-1.5"
                  >
                    <Trash2 className="size-3.5" />
                    {t("central.bulkUninstallConfirm")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBulkUninstalling}
                    onClick={() => setIsBulkUninstallConfirming(false)}
                    className="h-8 gap-1.5"
                  >
                    <X className="size-3.5" />
                    {t("common.cancel")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isBulkUninstalling}
                  onClick={() => setIsBulkUninstallConfirming(true)}
                  className="h-8 gap-1.5"
                >
                  <Trash2 className="size-3.5" />
                  {t("central.bulkUninstallAction")}
                </Button>
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
            {viewMode === "folders" && filteredBundles.length > 0 && (
              <section aria-label={t("central.bundlesSectionLabel")} className="space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">{t("central.bundlesTitle")}</h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredBundles.map((bundle) => {
                    const group = centralFolderGroupsByPath.get(bundle.relativePath);
                    return (
                      <SkillFolderCard
                        key={bundle.relativePath}
                        name={bundle.name}
                        path={bundle.path}
                        skillCount={bundle.skillCount}
                        linkedAgentCount={bundle.linkedAgentCount}
                        readOnlyAgentCount={bundle.readOnlyAgentCount}
                        isSymlink={bundle.isSymlink}
                        previewNames={group?.skills.map((skill) => skill.name) ?? []}
                        onOpen={() => void handleOpenBundleDrawer(bundle)}
                        onDelete={() => void handleDeleteBundleClick(bundle)}
                        deleteLabel={t("central.deleteBundleLabel", { name: bundle.name })}
                        isDeleting={deletingBundlePath === bundle.relativePath}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {filteredSkills.length === 0 && filteredBundles.length === 0 ? (
              <EmptyState message={t("central.noMatch", { query: searchQuery })} />
            ) : filteredSkills.length > 0 ? (
              <section className="space-y-3">
                {viewMode === "folders" && (
                  <div className="flex items-center gap-2">
                    <Blocks className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold">{t("skillFolder.topLevelSkills")}</h2>
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {sortedSkills.map((skill) => (
                    <UnifiedSkillCard
                      key={skill.id}
                      name={skill.name}
                      description={skill.description}
                      checkbox={
                        skill.linked_agents.length > 0
                          ? {
                              checked: selectedCentralSkillIds.has(skill.id),
                              onChange: () => toggleCentralSkillSelection(skill),
                              ariaLabel: t("central.selectSkillLabel", {
                                name: skill.name,
                              }),
                            }
                          : undefined
                      }
                      publisher={skill.source_repo ?? skill.source_author ?? undefined}
                      sourceAuthor={skill.source_author}
                      sourceRepo={skill.source_repo}
                      sourceUrl={skill.source_url}
                      createdAt={skill.created_at}
                      updatedAt={skill.updated_at}
                      tags={(skill.tags ?? []).map((tag) => ({ key: tag, label: tag }))}
                      onDetail={() => handleOpenDrawer(skill.id)}
                      onInstallTo={() => handleInstallClick(skill)}
                      onUpdateFromSource={
                        skill.source_url ? () => void handleUpdateSingleSource(skill) : undefined
                      }
                      updateFromSourceLabel={t("central.updateSourceLabel", { name: skill.name })}
                      onDeleteFromCentral={() => handleDeleteClick(skill)}
                      deleteFromCentralLabel={t("central.deleteFromCentralLabel", { name: skill.name })}
                      deleteFromCentralRequiresDialog={
                        skill.linked_agents.length > 0 || (skill.read_only_agents?.length ?? 0) > 0
                      }
                      isLoading={deletingSkillId === skill.id || updatingSkillId === skill.id}
                      detailButtonRef={(node) => setDetailButtonRef(skill.id, node)}
                      platformIcons={{
                        agents,
                        linkedAgents: skill.linked_agents,
                        readOnlyAgents: skill.read_only_agents ?? [],
                        skillId: skill.id,
                        onToggle: handleTogglePlatform,
                        onManage: () => handleOpenPlatformDrawer(skill.id),
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

      <CentralBundleDrawer
        open={isBundleDrawerOpen}
        detail={bundleDetail ?? null}
        agents={agents}
        loadingPath={loadingBundleDetailPath ?? bundleDrawerPath}
        onOpenChange={(open) => {
          setIsBundleDrawerOpen(open);
          if (!open) {
            setBundleDrawerPath(null);
            clearCentralBundleDetail();
          }
        }}
        onInstallationsChange={async () => {
          await Promise.all([
            loadCentralSkills(),
            loadCentralBundles(),
            bundleDrawerPath
              ? loadCentralBundleDetail(bundleDrawerPath)
              : Promise.resolve(null),
          ]);
        }}
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
