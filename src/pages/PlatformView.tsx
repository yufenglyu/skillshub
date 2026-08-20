import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Blocks, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePlatformStore } from "@/stores/platformStore";
import { useSkillStore } from "@/stores/skillStore";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkillDetailDrawer } from "@/components/skill/SkillDetailDrawer";
import { SkillBrowserTable, type FolderTableItem } from "@/components/skill/SkillBrowserTable";
import { SkillBrowserViewHeading } from "@/components/skill/SkillBrowserViewHeading";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { useSkillListViewMode } from "@/hooks/useSkillListViewMode";
import { useSkillTableColumns } from "@/hooks/useSkillTableColumns";
import { formatPathForDisplay } from "@/lib/path";
import { splitSkillsByTopLevel } from "@/lib/skillFolders";
import {
  sortBySkillBrowserOrder,
  sortFoldersBySkillBrowserOrder,
  type SkillSortDirection,
  type SkillSortField,
} from "@/lib/skillSort";
import { cn } from "@/lib/utils";
import { isProjectAgentId } from "@/lib/projectTargets";
import { ScannedSkill } from "@/types";

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

type ClaudeSourceFilter = "all" | "user" | "plugin";

function latestSkillUpdatedAt(skills: ScannedSkill[]) {
  return skills.reduce<string | null>((latest, skill) => {
    const value = skill.updated_at ?? null;
    if (!value) return latest;
    if (!latest) return value;
    return Date.parse(value) > Date.parse(latest) ? value : latest;
  }, null);
}

function earliestSkillCreatedAt(skills: ScannedSkill[]) {
  return skills.reduce<string | null>((earliest, skill) => {
    const value = skill.created_at ?? skill.updated_at ?? null;
    if (!value) return earliest;
    if (!earliest) return value;
    return Date.parse(value) < Date.parse(earliest) ? value : earliest;
  }, null);
}

// ─── PlatformView ─────────────────────────────────────────────────────────────

export function PlatformView() {
  const { agentId: encodedAgentId } = useParams<{ agentId: string }>();
  const agentId = useMemo(() => {
    if (!encodedAgentId) return undefined;
    try {
      return decodeURIComponent(encodedAgentId);
    } catch {
      return encodedAgentId;
    }
  }, [encodedAgentId]);
  const { t, i18n } = useTranslation();
  const agents = usePlatformStore((state) => state.agents);
  const scanGeneration = usePlatformStore((state) => state.scanGeneration ?? 0);

  const skillsByAgent = useSkillStore((state) => state.skillsByAgent);
  const loadingByAgent = useSkillStore((state) => state.loadingByAgent);
  const pendingSkillActionKeys = useSkillStore((state) => state.pendingSkillActionKeys);
  const getSkillsByAgent = useSkillStore((state) => state.getSkillsByAgent);
  const uninstallSkillFromAgent = useSkillStore((state) => state.uninstallSkillFromAgent);

  const centralSkills = useCentralSkillsStore((state) => state.skills);
  const loadCentralSkills = useCentralSkillsStore((state) => state.loadCentralSkills);
  const refreshCounts = usePlatformStore((state) => state.refreshCounts);

  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<ClaudeSourceFilter>("all");
  const [viewMode, setViewMode] = useSkillListViewMode("platform");
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
  const [drawerSkill, setDrawerSkill] = useState<ScannedSkill | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);
  const [folderUninstallGroupPath, setFolderUninstallGroupPath] = useState<string | null>(null);
  const [returnFocusRowKey, setReturnFocusRowKey] = useState<string | null>(null);
  const [isFolderUninstalling, setIsFolderUninstalling] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const detailButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function getSkillRowKey(skill: ScannedSkill) {
    return skill.row_id ?? skill.id;
  }

  const agent = agents.find((a) => a.id === agentId);
  const isClaudePage = agent?.id === "claude-code";
  const isProjectDirectoryPage = agent ? isProjectAgentId(agent.id) : false;

  // Load skills for this agent when the route changes or a fresh scan completes.
  useEffect(() => {
    if (agentId) {
      getSkillsByAgent(agentId);
    }
  }, [agentId, getSkillsByAgent, scanGeneration]);

  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.scrollTop = 0;
  }, [agentId]);

  useEffect(() => {
    setSourceFilter("all");
    setActiveFolderKey(null);
  }, [agentId]);

  // Ensure central skills are loaded so we can resolve SkillWithLinks for InstallDialog.
  useEffect(() => {
    if (centralSkills.length === 0) {
      loadCentralSkills();
    }
  }, [centralSkills.length, loadCentralSkills]);

  async function handleUninstall(skillId: string) {
    if (!agentId) return;
    try {
      await uninstallSkillFromAgent(skillId, agentId);
      await refreshCounts();
    } catch (err) {
      toast.error(t("detail.uninstallError", { error: String(err) }));
    }
  }

  function isUninstallable(skill: ScannedSkill) {
    return !(skill.is_read_only ?? false);
  }

  const isLoading = agentId ? (loadingByAgent[agentId] ?? false) : false;

  // Memoize skills to avoid changing dependency reference on every render
  const skills = useMemo(
    () => (agentId ? (skillsByAgent[agentId] ?? []) : []),
    [agentId, skillsByAgent]
  );

  const sourceFilteredSkills = useMemo(() => {
    if (!isClaudePage || sourceFilter === "all") {
      return skills;
    }
    return skills.filter((skill) => skill.source_kind === sourceFilter);
  }, [isClaudePage, skills, sourceFilter]);

  const centralSkillsById = useMemo(
    () => new Map(centralSkills.map((skill) => [skill.id, skill])),
    [centralSkills]
  );
  const platformFolderSplit = useMemo(
    () =>
      splitSkillsByTopLevel({
        skills: sourceFilteredSkills,
        rootPath: agent?.global_skills_dir ?? "",
        getRootPath: (skill) => skill.source_root ?? agent?.global_skills_dir ?? "",
        getDirPaths: (skill) => skill.dir_path,
        getLinkedAgentIds: (skill) =>
          centralSkillsById.get(skill.id)?.linked_agents ??
          (!skill.is_read_only && agentId ? [agentId] : []),
        getReadOnlyAgentIds: (skill) =>
          centralSkillsById.get(skill.id)?.read_only_agents ??
          (skill.is_read_only && agentId ? [agentId] : []),
      }),
    [agent?.global_skills_dir, agentId, centralSkillsById, sourceFilteredSkills]
  );
  const platformFolderGroupsByPath = useMemo(
    () =>
      new Map(
        platformFolderSplit.groups.map((group) => [
          group.relativePath,
          group,
        ])
      ),
    [platformFolderSplit.groups]
  );
  const activeFolder = activeFolderKey
    ? platformFolderGroupsByPath.get(activeFolderKey) ?? null
    : null;
  const visibleSkills =
    viewMode === "folders"
      ? activeFolder?.skills ?? platformFolderSplit.rootSkills
      : sourceFilteredSkills;
  const sourceCounts = useMemo(() => {
    const counts: Record<ClaudeSourceFilter, number> = {
      all: skills.length,
      user: 0,
      plugin: 0,
    };

    for (const skill of skills) {
      if (skill.source_kind === "user") {
        counts.user += 1;
      } else if (skill.source_kind === "plugin") {
        counts.plugin += 1;
      }
    }

    return counts;
  }, [skills]);

  // Filter skills by search query using useMemo
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return visibleSkills;
    const q = searchQuery.toLowerCase();
    return visibleSkills.filter(
      (skill) =>
        skill.id.toLowerCase().includes(q) ||
        skill.name.toLowerCase().includes(q) ||
        skill.description?.toLowerCase().includes(q)
    );
  }, [visibleSkills, searchQuery]);

  const sortedSkills = useMemo(() => {
    return sortBySkillBrowserOrder(filteredSkills, sortField, sortDirection);
  }, [filteredSkills, sortDirection, sortField]);

  const filteredFolderGroups = useMemo(() => {
    if (viewMode !== "folders" || activeFolder) return [];
    if (!searchQuery.trim()) return platformFolderSplit.groups;
    const q = searchQuery.toLowerCase();
    return platformFolderSplit.groups.filter(
      (group) =>
        group.name.toLowerCase().includes(q) ||
        group.path.toLowerCase().includes(q) ||
        group.skills.some(
          (skill) =>
            skill.id.toLowerCase().includes(q) ||
            skill.name.toLowerCase().includes(q) ||
            skill.description?.toLowerCase().includes(q)
        )
    );
  }, [activeFolder, platformFolderSplit.groups, searchQuery, viewMode]);

  const sortedFolderGroups = useMemo(() => {
    return sortFoldersBySkillBrowserOrder(filteredFolderGroups, sortField, sortDirection);
  }, [filteredFolderGroups, sortDirection, sortField]);

  const folderUninstallGroup = folderUninstallGroupPath
    ? platformFolderGroupsByPath.get(folderUninstallGroupPath) ?? null
    : null;
  const folderUninstallableSkills = useMemo(
    () => (folderUninstallGroup?.skills ?? []).filter(isUninstallable),
    [folderUninstallGroup?.skills]
  );

  useEffect(() => {
    if (viewMode === "all") {
      setActiveFolderKey(null);
    } else if (activeFolderKey && !platformFolderGroupsByPath.has(activeFolderKey)) {
      setActiveFolderKey(null);
    }
  }, [activeFolderKey, platformFolderGroupsByPath, viewMode]);

  useEffect(() => {
    if (!drawerSkill) return;

    const rowKey = getSkillRowKey(drawerSkill);
    const refreshedSkill = skills.find((skill) => getSkillRowKey(skill) === rowKey);

    if (!refreshedSkill) {
      setIsDrawerOpen(false);
      setDrawerSkill(null);
      return;
    }

    if (refreshedSkill !== drawerSkill) {
      setDrawerSkill(refreshedSkill);
    }
  }, [drawerSkill, skills]);

  function setDetailButtonRef(rowKey: string, node: HTMLButtonElement | null) {
    if (node) {
      detailButtonRefs.current[rowKey] = node;
      return;
    }
    delete detailButtonRefs.current[rowKey];
  }

  function handleOpenDrawer(skill: ScannedSkill) {
    setReturnFocusRowKey(getSkillRowKey(skill));
    setDrawerSkill(skill);
    setIsDrawerOpen(true);
  }

  function handleUninstallFolderClick(relativePath: string) {
    setFolderUninstallGroupPath(relativePath);
  }

  async function handleConfirmUninstallFolder() {
    if (!agentId || !folderUninstallGroup) return;
    const removableSkills = folderUninstallGroup.skills.filter(isUninstallable);
    if (removableSkills.length === 0) {
      setFolderUninstallGroupPath(null);
      return;
    }

    setIsFolderUninstalling(true);
    try {
      for (const skill of removableSkills) {
        await uninstallSkillFromAgent(skill.id, agentId);
      }
      await Promise.all([refreshCounts(), getSkillsByAgent(agentId)]);
      toast.success(t("skillFolder.uninstallFolderSuccess", { count: removableSkills.length }));
      setFolderUninstallGroupPath(null);
    } catch (err) {
      toast.error(t("detail.uninstallError", { error: String(err) }));
    } finally {
      setIsFolderUninstalling(false);
    }
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {t("platform.notFound")}
      </div>
    );
  }

  const sourceTabs: { id: ClaudeSourceFilter; label: string; count: number }[] = [
    {
      id: "all",
      label: t("platform.sourceFilter.all", {
        defaultValue: i18n.language.startsWith("zh") ? "全部" : "All",
      }),
      count: sourceCounts.all,
    },
    {
      id: "user",
      label: t("platform.sourceFilter.user", {
        defaultValue: i18n.language.startsWith("zh") ? "用户来源" : "User source",
      }),
      count: sourceCounts.user,
    },
    {
      id: "plugin",
      label: t("platform.sourceFilter.plugin", {
        defaultValue: i18n.language.startsWith("zh") ? "插件来源" : "Plugin source",
      }),
      count: sourceCounts.plugin,
    },
  ];
  const activeSourceLabel = sourceTabs.find((tab) => tab.id === sourceFilter)?.label ?? sourceTabs[0].label;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5">
          {isProjectDirectoryPage ? (
            <FolderOpen className="size-6 text-primary/70" />
          ) : (
            <PlatformIcon agentId={agent.id} className="size-6 text-primary/70" size={24} />
          )}
          <h1 className="text-xl font-semibold">{agent.display_name}</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {formatPathForDisplay(agent.global_skills_dir)}
        </p>
      </div>

      {isClaudePage && (
        <div
          role="tablist"
          aria-label={t("platform.sourceFilterTabsLabel", {
            defaultValue: i18n.language.startsWith("zh") ? "Claude 来源筛选" : "Claude source filters",
          })}
          className="flex items-center gap-1 px-6 py-3 border-b border-border"
        >
          {sourceTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={sourceFilter === tab.id}
              onClick={() => setSourceFilter(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-colors cursor-pointer",
                sourceFilter === tab.id
                  ? "bg-primary/15 text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/40"
              )}
            >
              <span>{tab.label}</span>
              <span className="text-xs opacity-75">({tab.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <SearchInput
            placeholder={t("platform.searchPlaceholder")}
            value={searchQuery}
            onValueChange={setSearchQuery}
            containerClassName="min-w-0 flex-1"
          />
          <SkillBrowserViewHeading
            value={viewMode}
            onChange={setViewMode}
            className="shrink-0"
          />
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <EmptyState message={t("platform.loading")} />
        ) : skills.length === 0 ? (
          <EmptyState
            message={t("platform.noSkills", { name: agent.display_name })}
          />
        ) : sourceFilteredSkills.length === 0 ? (
          <EmptyState
            message={t("platform.noSourceSkills", {
              name: agent.display_name,
              source: activeSourceLabel,
              defaultValue: i18n.language.startsWith("zh")
                ? `${agent.display_name} 下暂无${activeSourceLabel}技能`
                : `No ${activeSourceLabel} skills installed for ${agent.display_name}`,
            })}
          />
        ) : sortedSkills.length === 0 && sortedFolderGroups.length === 0 ? (
          <EmptyState
            message={t("platform.noMatch", { query: searchQuery })}
          />
        ) : (
          <div className="space-y-6">
            {viewMode === "folders" && activeFolder && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveFolderKey(null)}
                >
                  <ArrowLeft className="size-4" />
                  {t("resource.backToFolders")}
                </Button>
                <span className="text-sm font-medium text-muted-foreground">
                  {activeFolder.name}
                </span>
              </div>
            )}

            {viewMode === "folders" && sortedFolderGroups.length > 0 && (
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
                  folders={sortedFolderGroups.map(
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
                      onUninstall: group.skills.some(isUninstallable)
                        ? () => handleUninstallFolderClick(group.relativePath)
                        : undefined,
                      uninstallLabel: t("resource.uninstallFromTargetsAction"),
                      isUninstalling:
                        isFolderUninstalling &&
                        folderUninstallGroupPath === group.relativePath,
                    })
                  )}
                />
              </section>
            )}

            {sortedSkills.length > 0 && (
              <section className="space-y-3">
                {viewMode === "folders" && !activeFolder && (
                  <div className="flex items-center gap-2">
                    <Blocks className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold">{t("skillFolder.topLevelSkills")}</h2>
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
                    rowKey: getSkillRowKey(skill),
                    name: skill.name,
                    description: skill.description,
                    sourceType: skill.link_type as "symlink" | "copy" | "native",
                    sourceLocation: getSourceLocation(skill),
                    originKind: skill.source_kind ?? null,
                    isReadOnly: skill.is_read_only ?? false,
                    installAgents: agents,
                    installLinkedAgentIds:
                      centralSkillsById.get(skill.id)?.linked_agents ??
                      (!skill.is_read_only && agentId ? [agentId] : []),
                    installReadOnlyAgentIds:
                      centralSkillsById.get(skill.id)?.read_only_agents ??
                      (skill.is_read_only && agentId ? [agentId] : []),
                    sourceAuthor: skill.source_author,
                    sourceRepo: skill.source_repo,
                    sourceUrl: skill.source_url,
                    createdAt: skill.created_at,
                    updatedAt: skill.updated_at,
                    isLoading: agentId
                      ? (pendingSkillActionKeys[`${agentId}::${skill.id}`] ?? false)
                      : false,
                    onDetail: () => handleOpenDrawer(skill),
                    onUninstallFromPlatform: skill.is_read_only
                      ? undefined
                      : () => handleUninstall(skill.id),
                    uninstallFromLabel: t("resource.uninstallFromTargetsAction"),
                    detailButtonRef: (node) => setDetailButtonRef(getSkillRowKey(skill), node),
                  }))}
                />
              </section>
            )}
          </div>
        )}
      </div>

      <SkillDetailDrawer
        open={isDrawerOpen}
        skillId={drawerSkill?.id ?? null}
        agentId={agentId ?? null}
        rowId={drawerSkill?.row_id ?? null}
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) {
            setDrawerSkill(null);
          }
        }}
        returnFocusRef={
          returnFocusRowKey
            ? {
                current: detailButtonRefs.current[returnFocusRowKey] ?? null,
              }
            : undefined
        }
      />

      <Dialog
        open={!!folderUninstallGroup}
        onOpenChange={(open) => {
          if (!open && !isFolderUninstalling) {
            setFolderUninstallGroupPath(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("platform.uninstallFolderConfirmTitle", {
                name: folderUninstallGroup?.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {folderUninstallGroup
                ? t("platform.uninstallFolderConfirmDesc", {
                    count: folderUninstallableSkills.length,
                    platform: agent.display_name,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isFolderUninstalling}
              onClick={() => setFolderUninstallGroupPath(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isFolderUninstalling || folderUninstallableSkills.length === 0}
              onClick={() => void handleConfirmUninstallFolder()}
            >
              <Trash2 className="size-3.5" />
              {t("platform.uninstallFolderConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getSourceLocation(
  skill: Pick<ScannedSkill, "is_central" | "source" | "source_url" | "source_repo">
): "central" | "resource-library" | "standalone" {
  if (skill.is_central) return "central";

  const source = skill.source?.toLowerCase();
  if (
    source === "resource-library" ||
    source === "manual" ||
    source?.startsWith("github:") ||
    skill.source_url ||
    skill.source_repo
  ) {
    return "resource-library";
  }

  return "standalone";
}
