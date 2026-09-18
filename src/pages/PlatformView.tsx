import { cn } from "@/lib/utils";
import { SidebarTagFilter } from "@/components/layout/SidebarTagFilter";
import { SkillBrowserHeader } from "@/components/skill/SkillBrowserHeader";
import { OpenableDirectoryPath } from "@/components/common/OpenableDirectoryPath";
import { type FolderTableItem } from "@/components/skill/SkillBrowserTable";
import { SkillBrowserWorkspace } from "@/components/skill/SkillBrowserWorkspace";
import { SkillDetailDrawer } from "@/components/skill/SkillDetailDrawer";
import { Button } from "@/components/ui/button";
import {
Dialog,
DialogContent,
DialogDescription,
DialogFooter,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/search-input";
import { installationSourcesForSkill,platformSkillsWithSharedHub } from "@/lib/installSummary";
import {
dirnameFromSkillFile,
normalizeFsPath,
splitSkillsByTopLevel,
type SkillFolderGroup,
} from "@/lib/skillFolders";
import { repositoryLocationUrl } from "@/lib/skillNavigation";
import {
sortBySkillBrowserOrder,
sortFoldersBySkillBrowserOrder,
type SkillSortDirection,
type SkillSortField,
} from "@/lib/skillSort";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { usePlatformStore } from "@/stores/platformStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import { useSkillStore } from "@/stores/skillStore";
import { ScannedSkill } from "@/types";
import { RefreshCw,Trash2 } from "lucide-react";
import { useEffect,useMemo,useRef,useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate,useParams } from "react-router-dom";
import { toast } from "sonner";

// ─── Empty State ──────────────────────────────────────────────────────────────



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

function uniqueAgentIds(values: Iterable<string | undefined | null>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function sourceFolderName(skill: ScannedSkill): string | null {
  const repo = skill.source_repo?.trim();
  if (repo) return repo;
  const sourcePath = skill.source_path?.replace(/\\/g, "/").trim();
  if (!sourcePath || sourcePath === ".") return null;
  const parts = sourcePath.split("/").filter(Boolean);
  if (parts.length >= 3 && parts[0].toLowerCase() === "plugins") {
    return `${parts[0]}/${parts[1]}`;
  }
  if (parts.length >= 2 && parts[0].toLowerCase() === "skills") {
    return parts.length >= 3 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return parts[0] ?? null;
}

function splitPlatformSkillsBySourceFolder(
  skills: ScannedSkill[],
  fallbackGroups: SkillFolderGroup<ScannedSkill>[],
  agentId?: string
) {
  const sourceGroups = new Map<string, SkillFolderGroup<ScannedSkill>>();
  const groupedRowKeys = new Set<string>();

  for (const skill of skills) {
    const name = sourceFolderName(skill);
    if (!name) continue;
    const key = `source:${name.toLowerCase()}`;
    const group =
      sourceGroups.get(key) ?? {
        name,
        relativePath: key,
        path: skill.dir_path ?? dirnameFromSkillFile(skill.file_path) ?? name,
        skillCount: 0,
        linkedAgentIds: [],
        readOnlyAgentIds: [],
        linkedAgentCount: 0,
        readOnlyAgentCount: 0,
        skills: [],
      };

    group.skills.push(skill);
    group.skills.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
    group.skillCount = group.skills.length;
    group.linkedAgentIds = uniqueAgentIds(
      group.skills.flatMap((item): Array<string | undefined> =>
        item.is_read_only ? [] : [agentId]
      )
    );
    group.readOnlyAgentIds = uniqueAgentIds(
      group.skills.flatMap((item): Array<string | undefined> =>
        item.is_read_only ? [agentId] : []
      )
    );
    group.linkedAgentCount = group.linkedAgentIds.length;
    group.readOnlyAgentCount = group.readOnlyAgentIds.length;
    sourceGroups.set(key, group);
    groupedRowKeys.add(skill.row_id ?? skill.id);
  }

  const merged = [...sourceGroups.values()];
  for (const group of fallbackGroups) {
    const remainingSkills = group.skills.filter(
      (skill) => !groupedRowKeys.has(skill.row_id ?? skill.id)
    );
    if (remainingSkills.length === 0) continue;
    merged.push({
      ...group,
      skills: remainingSkills,
      skillCount: remainingSkills.length,
    });
  }

  return merged.sort((a, b) =>
    normalizeFsPath(a.relativePath).localeCompare(normalizeFsPath(b.relativePath), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

// ─── PlatformView ─────────────────────────────────────────────────────────────

export function PlatformView() {
  const navigate = useNavigate();
  const { agentId: encodedAgentId } = useParams<{ agentId: string }>();
  const agentId = useMemo(() => {
    if (!encodedAgentId) return undefined;
    try {
      return decodeURIComponent(encodedAgentId);
    } catch {
      return encodedAgentId;
    }
  }, [encodedAgentId]);
  const { t } = useTranslation();
  const agents = usePlatformStore((state) => state.agents);
  const scanGeneration = usePlatformStore((state) => state.scanGeneration ?? 0);

  const skillsByAgent = useSkillStore((state) => state.skillsByAgent);
  const loadingByAgent = useSkillStore((state) => state.loadingByAgent);
  const pendingSkillActionKeys = useSkillStore((state) => state.pendingSkillActionKeys);
  const getSkillsByAgent = useSkillStore((state) => state.getSkillsByAgent);
  const uninstallSkillFromAgent = useSkillStore((state) => state.uninstallSkillFromAgent);

  const resourceSkills = useResourceLibraryStore(state => state.skills);
  const loadResourceLibrary = useResourceLibraryStore(state => state.loadResourceLibrary);
  useEffect(() => { void loadResourceLibrary(); }, [loadResourceLibrary]);
  const resourceTagsById = useMemo(
    () => new Map(resourceSkills.map(skill => [skill.id, skill.tags ?? []])),
    [resourceSkills]
  );
  const centralSkills = useCentralSkillsStore((state) => state.skills);
  const loadCentralSkills = useCentralSkillsStore((state) => state.loadCentralSkills);
  const refreshCounts = usePlatformStore((state) => state.refreshCounts);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);



  const [sortField, setSortField] = useState<SkillSortField>("name");
  const [sortDirection, setSortDirection] = useState<SkillSortDirection>("asc");
  const [drawerSkill, setDrawerSkill] = useState<ScannedSkill | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [folderUninstallGroupPath, setFolderUninstallGroupPath] = useState<string | null>(null);
  const [returnFocusRowKey, setReturnFocusRowKey] = useState<string | null>(null);
  const [isFolderUninstalling, setIsFolderUninstalling] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const detailButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function getSkillRowKey(skill: ScannedSkill) {
    return skill.row_id ?? skill.id;
  }

  const agent = agents.find((a) => a.id === agentId);

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
    setSelectedTag(null);
  }, [agentId]);

  // Ensure central skills are loaded so we can resolve SkillWithLinks for InstallDialog.
  useEffect(() => {
    if (centralSkills.length === 0) {
      loadCentralSkills();
    }
  }, [centralSkills.length, loadCentralSkills]);

  async function handleUninstall(skill: ScannedSkill) {
    if (!agentId) return;
    if (installationSourcesForSkill(skill).includes("shared")) {
      toast.error(t("platform.sharedUninstallBlocked"));
      return;
    }
    const skillId = skill.id;
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
    () => platformSkillsWithSharedHub(agentId ? (skillsByAgent[agentId] ?? []) : [], centralSkills, agent?.is_enabled ?? false),
    [agentId, skillsByAgent, centralSkills, agent?.is_enabled]
  );

  const centralSkillsById = useMemo(
    () => new Map(centralSkills.map((skill) => [skill.id, skill])),
    [centralSkills]
  );
  const tagsBySkillId = useMemo(() => new Map(skills.map(skill => [skill.id,
    resourceTagsById.get(skill.id) ?? centralSkillsById.get(skill.id)?.tags ?? [],
  ])), [skills, resourceTagsById, centralSkillsById]);
  const availableTags = useMemo(() => {
    const tags = new Map<string, string>();
    for (const values of tagsBySkillId.values()) for (const value of values) {
      const label = value.trim();
      if (label) tags.set(label.toLowerCase(), label);
    }
    return [...tags].map(([key, label]) => ({key, label})).sort((a,b) => a.label.localeCompare(b.label));
  }, [tagsBySkillId]);
  useEffect(() => {
    if (selectedTag && !availableTags.some(tag => tag.key === selectedTag)) setSelectedTag(null);
  }, [availableTags, selectedTag]);
  const platformFolderSplit = useMemo(
    () =>
      splitSkillsByTopLevel({
        skills,
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
    [agent?.global_skills_dir, agentId, centralSkillsById, skills]
  );
  const platformFolderGroupsByPath = useMemo(
    () =>
      new Map(
        splitPlatformSkillsBySourceFolder(
          skills,
          platformFolderSplit.groups,
          agentId
        ).map((group) => [
          group.relativePath,
          group,
        ])
      ),
    [agentId, platformFolderSplit.groups, skills]
  );

  const visibleSkills = useMemo(
    () =>
      skills.filter(skill => !selectedTag || tagsBySkillId.get(skill.id)?.some(tag => tag.trim().toLowerCase() === selectedTag)),
    [skills, selectedTag, tagsBySkillId]
  );

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

    const folderGroups = [...platformFolderGroupsByPath.values()].filter(group => !selectedTag || group.skills.some(skill =>
      tagsBySkillId.get(skill.id)?.some(tag => tag.trim().toLowerCase() === selectedTag)));
    if (!searchQuery.trim()) return folderGroups;
    const q = searchQuery.toLowerCase();
    return folderGroups.filter(
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
  }, [platformFolderGroupsByPath, searchQuery, selectedTag, tagsBySkillId]);

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
    const group = platformFolderGroupsByPath.get(relativePath);
    if (group?.skills.some(skill => installationSourcesForSkill(skill).includes("shared"))) {
      toast.error(t("platform.sharedFolderUninstallBlocked"));
      return;
    }
    setFolderUninstallGroupPath(relativePath);
  }

  async function handleConfirmUninstallFolder() {
    if (!agentId || !folderUninstallGroup) return;
    if (folderUninstallGroup.skills.some(skill => installationSourcesForSkill(skill).includes("shared"))) {
      toast.error(t("platform.sharedFolderUninstallBlocked"));
      setFolderUninstallGroupPath(null);
      return;
    }
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

  return (
    <div className="flex flex-col h-full">
      <SidebarTagFilter>
        <div role="group" aria-label={t("central.tagFilter")} className="flex flex-wrap items-center gap-1.5">
          {availableTags.map(tag => <button key={tag.key} type="button" aria-pressed={selectedTag === tag.key}
            onClick={() => setSelectedTag(selectedTag === tag.key ? null : tag.key)}
            className={cn("h-7 rounded-lg px-2.5 text-xs font-medium transition-colors",
              selectedTag === tag.key ? "bg-primary/15 text-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
          >{tag.label}</button>)}
        </div>
      </SidebarTagFilter>
      {/* Header */}


      {/* Search bar */}


      {/* Content */}
      <SkillBrowserWorkspace toolbar={<SkillBrowserHeader title={<div>
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" title={t("collection.refresh")} aria-label={t("collection.refresh")} disabled={isLoading} onClick={() => void Promise.all([getSkillsByAgent(agent.id), refreshCounts()])}><RefreshCw className={cn("size-4", isLoading && "animate-spin")} /></Button>
          <h1 className="text-xl font-semibold">{agent.display_name}</h1>
        </div>
        <OpenableDirectoryPath iconOnly path={agent.global_skills_dir} />
        </div>} search={<SearchInput
            placeholder={t("platform.searchPlaceholder")}
            value={searchQuery}
            onValueChange={setSearchQuery}
            containerClassName="w-64 min-w-32 max-w-sm flex-1"
          />} />} loading={isLoading} folders={sortedFolderGroups.map(
                    (group): FolderTableItem => ({
                      key: group.relativePath,
                      onLocate: () => navigate(repositoryLocationUrl(group.skills[0], true)),
                      installationSources: [
                        ...(group.skills.some((skill) => installationSourcesForSkill(skill).includes("independent")) ? ["independent" as const] : []),
                        ...(group.skills.some((skill) => installationSourcesForSkill(skill).includes("shared")) ? ["shared" as const] : []),
                      ],
                      name: group.name,
                      path: group.path,
                      skillCount: group.skillCount,
 skillKeys: group.skills.map(skill => getSkillRowKey(skill)),
                      tags: [...new Set(group.skills.flatMap(skill => resourceTagsById.get(skill.id) ?? centralSkillsById.get(skill.id)?.tags ?? []))],
                      installAgents: agents,
                      installLinkedAgentIds: group.linkedAgentIds,
                      installReadOnlyAgentIds: group.readOnlyAgentIds,
                      previewNames: group.skills.map((skill) => skill.name),
                      createdAt: earliestSkillCreatedAt(group.skills),
                      updatedAt: latestSkillUpdatedAt(group.skills),
                      onOpen: () => {},
                      onUninstall: () => handleUninstallFolderClick(group.relativePath),
                      uninstallLabel: t("resource.uninstallFromTargetsAction"),
                      isUninstalling:
                        isFolderUninstalling &&
                        folderUninstallGroupPath === group.relativePath,
                    })
                  )} storageKey="PlatformView" agentId={agentId} searchActive={Boolean(searchQuery.trim() || selectedTag)}
                  showInstallationSource
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSortChange={(field, direction) => {
                    setSortField(field);
                    setSortDirection(direction);
                  }}
                  skills={sortedSkills.map((skill) => ({
                    rowKey: getSkillRowKey(skill),
                    batchOperations: {
                      uninstall: skill.is_read_only ? undefined : async () => {
                        if(installationSourcesForSkill(skill).includes("shared")) throw new Error(t("platform.sharedUninstallBlocked"));
                        if(!agentId) return;
                        await uninstallSkillFromAgent(skill.id,agentId); await refreshCounts();
                      },
                    },
 detailRequest: { skillId: skill.id, agentId, rowId: skill.row_id ?? skill.id },
                    onLocate: () => navigate(repositoryLocationUrl(skill, false)),
                    installationSources: installationSourcesForSkill(skill),
                    isCentral: installationSourcesForSkill(skill).includes("shared"),
                    name: skill.name,
                    description: skill.description,
                    tags: (resourceTagsById.get(skill.id) ?? centralSkillsById.get(skill.id)?.tags ?? []).map(tag => ({ key: tag, label: tag })),
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
                    onUninstallFromPlatform: () => handleUninstall(skill),
                    uninstallRequiresConfirmation: !installationSourcesForSkill(skill).includes("shared"),
                    uninstallFromLabel: t("resource.uninstallFromTargetsAction"),
                    detailButtonRef: (node) => setDetailButtonRef(getSkillRowKey(skill), node),
                  }))}
                />

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
