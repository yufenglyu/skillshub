import {
  Check,
  Database,
  ExternalLink,
  FolderOpen,
  Link2,
  Lock,
  Loader2,
  PackageMinus,
  PackagePlus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MouseEventHandler,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { InlineConfirmAction } from "@/components/ui/inline-confirm-action";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import type { SkillTableKind } from "@/hooks/useSkillTableColumns";
import { FIXED_SKILL_COLUMNS } from "@/hooks/useSkillTableColumns";
import { optionsForSkillTable } from "@/components/skill/skillColumnOptions";
import { formatPathForDisplay } from "@/lib/path";
import { isInstallTargetAgent } from "@/lib/agents";
import {
  nextSkillSortDirection,
  type SkillSortDirection,
  type SkillSortField,
} from "@/lib/skillSort";
import { cn } from "@/lib/utils";
import type { AgentWithStatus, ClaudeSourceKind } from "@/types";
import type { UnifiedSkillCardProps } from "@/components/skill/UnifiedSkillCard";

export interface FolderTableItem {
  key: string;
  name: string;
  path: string;
  skillCount: number;
  linkedAgentCount?: number;
  readOnlyAgentCount?: number;
  previewNames?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  notesSummary?: string | null;
  onOpen: () => void;
  onAddToCentral?: () => void;
  addToCentralLabel?: string;
  isAddingToCentral?: boolean;
  onInstall?: () => void;
  installLabel?: string;
  isInstalling?: boolean;
  onUninstall?: () => void;
  uninstallLabel?: string;
  isUninstalling?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  isDeleting?: boolean;
}

interface SkillBrowserTableProps {
  kind: SkillTableKind;
  visibleColumns: Set<string>;
  skills?: UnifiedSkillCardProps[];
  folders?: FolderTableItem[];
  sortField?: SkillSortField;
  sortDirection?: SkillSortDirection;
  onSortChange?: (field: SkillSortField, direction: SkillSortDirection) => void;
  onToggleColumn?: (key: string) => void;
  onResetColumns?: () => void;
  className?: string;
}

const FIXED_COLUMNS = new Set<string>(FIXED_SKILL_COLUMNS);
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  name: 384,
  source: 180,
  createdAt: 140,
  updatedAt: 140,
  installStatus: 190,
  rating: 90,
  tags: 180,
  notes: 256,
  path: 448,
  skillCount: 100,
  installSummary: 180,
  notesSummary: 160,
  actions: 120,
};
const MIN_COLUMN_WIDTH = 80;
const COLUMN_WIDTH_EVENT = "skills-manage:skill-table-widths";
const FEATURED_CODING_AGENT_IDS = [
  "cursor",
  "trae",
  "claude-code",
  "windsurf",
  "codex",
  "qwen",
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function sourceLabel(skill: UnifiedSkillCardProps) {
  return skill.sourceRepo ?? skill.sourceAuthor ?? skill.publisher ?? "-";
}

function installStatusLabel(
  t: ReturnType<typeof useTranslation>["t"],
  skill: UnifiedSkillCardProps
) {
  if (skill.sourceType) {
    return skill.sourceType === "symlink"
      ? t("platform.sourceSymlinkLabel")
      : skill.sourceType === "native"
        ? t("platform.sourceNativeLabel", { defaultValue: "native" })
        : t("platform.sourceCopyLabel");
  }
  const linkedCount = skill.platformIcons?.linkedAgents.length ?? 0;
  const readOnlyCount = skill.platformIcons?.readOnlyAgents?.length ?? 0;
  if (linkedCount === 0 && readOnlyCount === 0) return t("central.platformSummaryNotInstalled");
  if (readOnlyCount > 0) {
    return t("skillBrowser.installSummaryMixed", {
      linked: linkedCount,
      shared: readOnlyCount,
    });
  }
  return t("central.platformSummaryShared", { count: linkedCount });
}

function ActionButton({
  label,
  onClick,
  disabled,
  children,
  destructive = false,
  buttonRef,
}: {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children: ReactNode;
  destructive?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
        destructive
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-primary/10 hover:text-primary",
        disabled && "pointer-events-none opacity-50"
      )}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SkillActions({ skill }: { skill: UnifiedSkillCardProps }) {
  const { t } = useTranslation();
  const busy = !!skill.isLoading;
  const actions = [];

  if (skill.onInstallToCentral && !skill.isCentral) {
    actions.push(
      <ActionButton
        key="central"
        label={skill.installToCentralLabel ?? t("discover.installToCentral")}
        disabled={busy}
        onClick={skill.onInstallToCentral}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
      </ActionButton>
    );
  }

  if (skill.onInstallTo) {
    actions.push(
      <ActionButton
        key="install-to"
        label={t("central.installLabel", { name: skill.name })}
        disabled={busy}
        onClick={skill.onInstallTo}
      >
        <PackagePlus className="size-4" />
      </ActionButton>
    );
  }

  if (skill.onDetail) {
    actions.push(
      <ActionButton
        key="detail"
        label={t("central.viewDetailsLabel", { name: skill.name })}
        onClick={(event) => skill.onDetail?.(event)}
        buttonRef={skill.detailButtonRef}
      >
        <ExternalLink className="size-4" />
      </ActionButton>
    );
  }

  if (skill.onUpdateFromSource) {
    actions.push(
      <ActionButton
        key="update"
        label={skill.updateFromSourceLabel ?? t("central.updateFromSource")}
        disabled={busy}
        onClick={skill.onUpdateFromSource}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      </ActionButton>
    );
  }

  if (skill.onUninstallFromPlatform) {
    actions.push(
      <InlineConfirmAction
        key="uninstall"
        onConfirm={skill.onUninstallFromPlatform}
        isLoading={busy}
        idleTitle={skill.uninstallFromLabel ?? t("common.uninstall")}
        idleAriaLabel={skill.uninstallFromLabel ?? t("common.uninstall")}
        confirmLabel={t("common.confirmDelete")}
        icon={<X className="size-4" />}
      />
    );
  }

  if (skill.onDeleteFromCentral) {
    actions.push(
      skill.deleteFromCentralRequiresDialog ? (
        <ActionButton
          key="delete"
          label={skill.deleteFromCentralLabel ?? t("common.delete")}
          disabled={busy}
          destructive
          onClick={skill.onDeleteFromCentral}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </ActionButton>
      ) : (
        <InlineConfirmAction
          key="delete"
          onConfirm={skill.onDeleteFromCentral}
          isLoading={busy}
          idleTitle={skill.deleteFromCentralLabel ?? t("common.delete")}
          idleAriaLabel={skill.deleteFromCentralLabel ?? t("common.delete")}
          confirmLabel={t("common.confirmDelete")}
          icon={<Trash2 className="size-4" />}
        />
      )
    );
  }

  if (skill.onInstall && skill.isInstalled) {
    actions.push(
      <span
        key="installed"
        className="inline-flex size-7 items-center justify-center rounded-md text-primary"
        title={t("common.installed")}
      >
        <Check className="size-4" />
      </span>
    );
  }

  if (skill.onRemove) {
    actions.push(
      <InlineConfirmAction
        key="remove"
        onConfirm={skill.onRemove}
        isLoading={busy}
        idleTitle={t("collection.removeSkillLabel", { name: skill.name })}
        idleAriaLabel={t("collection.removeSkillLabel", { name: skill.name })}
        confirmLabel={t("common.confirmDelete")}
        icon={<X className="size-4" />}
      />
    );
  }

  return <div className="flex justify-start gap-1">{actions}</div>;
}

function PlatformToggleIcon({
  agent,
  skillName,
  isLinked,
  isReadOnly,
  isToggling,
  onToggle,
}: {
  agent: AgentWithStatus;
  skillName: string;
  isLinked: boolean;
  isReadOnly: boolean;
  isToggling: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors",
        isLinked
          ? "text-primary hover:bg-primary/10"
          : "text-muted-foreground/40 hover:bg-muted/60 hover:text-muted-foreground",
        isReadOnly && "cursor-default hover:bg-transparent",
        isToggling && "pointer-events-none animate-pulse"
      )}
      title={agent.display_name}
      aria-label={t("central.toggleInstallLabel", {
        platform: agent.display_name,
        skill: skillName,
      })}
      aria-pressed={isLinked}
      disabled={isToggling || isReadOnly}
      onClick={onToggle}
    >
      <PlatformIcon
        agentId={agent.id}
        className={cn(
          "size-4 shrink-0 transition-all",
          isLinked ? "opacity-100 grayscale-0" : "opacity-40 grayscale"
        )}
        size={16}
      />
    </button>
  );
}

function InstallStatusIcons({ skill }: { skill: UnifiedSkillCardProps }) {
  const { t } = useTranslation();
  const platformIcons = skill.platformIcons;
  if (!platformIcons) return null;
  const icons = platformIcons;

  const targetPlatformAgents = icons.agents.filter(isInstallTargetAgent);
  const lobsterAgents = targetPlatformAgents.filter((agent) => agent.category === "lobster");
  const codingAgents = targetPlatformAgents.filter((agent) => agent.category !== "lobster");
  const linkedAgentIds = new Set(icons.linkedAgents);
  const readOnlyAgentIds = new Set(icons.readOnlyAgents ?? []);
  const featuredCodingAgents = FEATURED_CODING_AGENT_IDS
    .map((agentId) => codingAgents.find((agent) => agent.id === agentId))
    .filter((agent): agent is AgentWithStatus => !!agent);
  const featuredCodingAgentIds = new Set(featuredCodingAgents.map((agent) => agent.id));
  const hiddenCodingCount = codingAgents.filter(
    (agent) => !featuredCodingAgentIds.has(agent.id)
  ).length;

  if (lobsterAgents.length === 0 && codingAgents.length === 0) return null;

  function renderAgent(agent: AgentWithStatus) {
    const isReadOnlyAgent = readOnlyAgentIds.has(agent.id);
    return (
      <PlatformToggleIcon
        key={agent.id}
        agent={agent}
        skillName={skill.name}
        isLinked={linkedAgentIds.has(agent.id) || isReadOnlyAgent}
        isReadOnly={isReadOnlyAgent}
        isToggling={icons.togglingAgentId === agent.id}
        onToggle={() => icons.onToggle(icons.skillId, agent.id)}
      />
    );
  }

  return (
    <div className="space-y-1">
      {lobsterAgents.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-[10px] font-medium text-muted-foreground/70">
            {t("sidebar.categoryLobster")}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
            {lobsterAgents.map(renderAgent)}
          </div>
        </div>
      ) : null}
      {codingAgents.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-[10px] font-medium text-muted-foreground/70">
            {t("sidebar.categoryCoding")}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
            {featuredCodingAgents.map(renderAgent)}
            {hiddenCodingCount > 0 ? (
              <span className="ml-0.5 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                +{hiddenCodingCount}
              </span>
            ) : null}
          </div>
          {platformIcons.onManage ? (
            <button
              type="button"
              onClick={platformIcons.onManage}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("central.managePlatformsLabel", { skill: skill.name })}
            >
              {t("central.managePlatforms")}
            </button>
          ) : null}
        </div>
      ) : null}
      {codingAgents.length === 0 && platformIcons.onManage ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={platformIcons.onManage}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("central.managePlatformsLabel", { skill: skill.name })}
          >
            {t("central.managePlatforms")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SourceIndicator({
  sourceType,
  sourceLocation = "standalone",
}: {
  sourceType: "symlink" | "copy" | "native";
  sourceLocation?: "central" | "resource-library" | "standalone";
}) {
  const { t, i18n } = useTranslation();
  const isSymlink = sourceType === "symlink";
  const isNative = sourceType === "native";
  const primaryLabel =
    sourceLocation === "central"
      ? t("platform.sourceCentral")
      : sourceLocation === "resource-library"
        ? t("platform.sourceResourceLibrary")
        : t("platform.sourceStandalone");
  const secondaryLabel = isSymlink
    ? t("platform.sourceSymlinkLabel")
    : isNative
      ? t("platform.sourceNativeLabel", {
          defaultValue: i18n.language.startsWith("zh") ? "原生" : "native",
        })
      : t("platform.sourceCopyLabel");

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        isSymlink ? "text-primary/80" : "text-muted-foreground"
      )}
    >
      {isSymlink ? <Link2 className="size-3 shrink-0" /> : <FolderOpen className="size-3 shrink-0" />}
      <div className="inline-flex items-center gap-1">
        <span>{primaryLabel}</span>
        <span aria-hidden="true" className="h-px w-3 shrink-0 rounded-full bg-current opacity-40" />
        <span className="sr-only"> - </span>
        <span>{secondaryLabel}</span>
      </div>
    </div>
  );
}

function SourceOriginBadge({ originKind }: { originKind: ClaudeSourceKind }) {
  const { t, i18n } = useTranslation();
  const isPlugin = originKind === "plugin";
  const isCompatibility = originKind === "compatibility";

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
        isPlugin
          ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300"
          : isCompatibility
            ? "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300"
            : "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300"
      )}
    >
      {isPlugin
        ? t("platform.originPlugin", {
            defaultValue: i18n.language.startsWith("zh") ? "插件来源" : "Plugin source",
          })
        : isCompatibility
          ? t("platform.originCompatibility", {
              defaultValue: i18n.language.startsWith("zh")
                ? "中央库兼容可见"
                : "Visible from Central",
            })
          : t("platform.originUser", {
              defaultValue: i18n.language.startsWith("zh") ? "用户来源" : "User source",
            })}
    </span>
  );
}

function ReadOnlyBadge() {
  const { t, i18n } = useTranslation();
  const label = t("platform.readOnly", {
    defaultValue: i18n.language.startsWith("zh") ? "只读" : "Read-only",
  });
  const description = t("platform.readOnlyHint", {
    defaultValue: i18n.language.startsWith("zh")
      ? "来自中央库或插件缓存的只读可见项，不是当前平台的可删除安装。"
      : "Visible from Central or a plugin cache; this is not a removable install in the current platform.",
  });

  return (
    <span
      className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/70"
      title={description}
      aria-label={`${label}: ${description}`}
    >
      <Lock className="size-3 shrink-0" />
      {label}
    </span>
  );
}

function NotesCell({ notes }: { notes?: string | null }) {
  if (!notes?.trim()) return <span className="text-muted-foreground">-</span>;
  return <span className="line-clamp-2">{notes.trim()}</span>;
}

function columnWidthStorageKey(kind: SkillTableKind) {
  return `skills-manage.skillTableColumnWidths.${kind}`;
}

function readColumnWidths(kind: SkillTableKind) {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(columnWidthStorageKey(kind));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]): [string, number] => [key, Number(value)])
        .filter((entry): entry is [string, number] => {
          const [, value] = entry;
          return Number.isFinite(value) && value >= MIN_COLUMN_WIDTH;
        })
    );
  } catch {
    return {};
  }
}

function isSortableColumn(column: string, kind: SkillTableKind): column is SkillSortField {
  if (kind === "folder") return column === "name" || column === "createdAt" || column === "updatedAt";
  return column === "name" || column === "source" || column === "createdAt" || column === "updatedAt";
}

function sortHeaderLabel(
  t: ReturnType<typeof useTranslation>["t"],
  label: string,
  direction: SkillSortDirection
) {
  return t("skillBrowser.sortedHeaderLabel", {
    label,
    direction: t(
      direction === "asc" ? "skillBrowser.sortDirectionAsc" : "skillBrowser.sortDirectionDesc"
    ),
  });
}

export function SkillBrowserTable({
  kind,
  visibleColumns,
  skills = [],
  folders = [],
  sortField,
  sortDirection = "asc",
  onSortChange,
  onToggleColumn,
  onResetColumns,
  className,
}: SkillBrowserTableProps) {
  const { t } = useTranslation();
  const [columnMenu, setColumnMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    readColumnWidths(kind)
  );
  const dragState = useRef<{
    column: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const columns =
    kind === "skill"
      ? ["name", "source", "createdAt", "updatedAt", "installStatus", "rating", "tags", "notes", "actions"]
      : ["name", "path", "skillCount", "installSummary", "createdAt", "updatedAt", "notesSummary", "actions"];
  const activeColumns = columns.filter((column) => visibleColumns.has(column));
  const columnOptions = useMemo(() => optionsForSkillTable(kind), [kind]);

  useEffect(() => {
    setColumnWidths(readColumnWidths(kind));
  }, [kind]);

  useEffect(() => {
    function closeMenu() {
      setColumnMenu(null);
    }
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeMenu);
    };
  }, []);

  const persistColumnWidths = useCallback(
    (next: Record<string, number>) => {
      try {
        window.localStorage.setItem(columnWidthStorageKey(kind), JSON.stringify(next));
      } catch {
        // Keep in-memory column widths if localStorage is unavailable.
      }
      window.dispatchEvent(new CustomEvent(COLUMN_WIDTH_EVENT, { detail: { kind, widths: next } }));
    },
    [kind]
  );

  function handleResizePointerDown(
    event: ReactPointerEvent<HTMLSpanElement>,
    column: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    dragState.current = {
      column,
      startX: event.clientX,
      startWidth: columnWidths[column] ?? DEFAULT_COLUMN_WIDTHS[column] ?? 140,
    };

    function handleMove(moveEvent: PointerEvent) {
      const state = dragState.current;
      if (!state) return;
      const width = Math.max(MIN_COLUMN_WIDTH, state.startWidth + moveEvent.clientX - state.startX);
      setColumnWidths((previous) => {
        const next = { ...previous, [state.column]: width };
        persistColumnWidths(next);
        return next;
      });
    }

    function handleUp() {
      dragState.current = null;
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    }

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  }

  function handleHeaderContextMenu(event: ReactMouseEvent<HTMLTableCellElement>) {
    if (!onToggleColumn && !onResetColumns) return;
    event.preventDefault();
    setColumnMenu({ x: event.clientX, y: event.clientY });
  }

  function renderHeaderContent(column: string) {
    const label = t(`skillBrowser.columns.${column}`);
    const sortable = onSortChange && isSortableColumn(column, kind);
    const selected = sortable && sortField === column;
    if (!sortable) return label;
    const sortMarker = selected ? (sortDirection === "asc" ? "↑" : "↓") : "↕";

    return (
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-md text-left transition-colors hover:text-primary",
          selected && "font-semibold text-foreground"
        )}
        aria-label={selected ? sortHeaderLabel(t, label, sortDirection) : label}
        onClick={() =>
          onSortChange(
            column,
            nextSkillSortDirection(sortField ?? "name", sortDirection, column)
          )
        }
      >
        <span className="truncate">{label}</span>
        <span
          aria-hidden="true"
          className={cn("text-[0.7rem]", selected ? "text-primary" : "text-muted-foreground/60")}
        >
          {sortMarker}
        </span>
      </button>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="border-b border-border bg-muted/35 text-xs font-medium text-muted-foreground">
            <tr>
              {activeColumns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  aria-label={t(`skillBrowser.columns.${column}`)}
                  onContextMenu={handleHeaderContextMenu}
                  style={{
                    width: `${columnWidths[column] ?? DEFAULT_COLUMN_WIDTHS[column] ?? 140}px`,
                  }}
                  className={cn(
                    "relative px-3 py-2 font-medium",
                    column === "actions" && "w-36"
                  )}
                >
                  {renderHeaderContent(column)}
                  {column !== "actions" ? (
                    <span
                      role="separator"
                      aria-label={t("skillBrowser.resizeColumnLabel", {
                        column: t(`skillBrowser.columns.${column}`),
                      })}
                      tabIndex={0}
                      onPointerDown={(event) => handleResizePointerDown(event, column)}
                      className="absolute right-0 top-1 bottom-1 w-1 cursor-col-resize rounded-full bg-transparent transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none"
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {kind === "skill"
              ? skills.map((skill) => (
                  <tr key={skill.rowKey ?? skill.name} className="align-top transition-colors hover:bg-muted/25">
                    {activeColumns.map((column) => {
                      if (column === "name") {
                        return (
                          <td key={column} className="px-3 py-2">
                            <div className="flex min-w-0 items-start gap-2">
                              {skill.checkbox && !skill.isReadOnly ? (
                                <input
                                  type="checkbox"
                                  checked={skill.checkbox.checked}
                                  onChange={skill.checkbox.onChange}
                                  aria-label={skill.checkbox.ariaLabel}
                                  className="mt-0.5 size-4 accent-primary"
                                />
                              ) : null}
                              <div className="min-w-0">
                                {skill.onDetail ? (
                                  <button
                                    type="button"
                                    className="block max-w-full truncate text-left font-medium text-foreground hover:text-primary hover:underline"
                                    onClick={skill.onDetail}
                                  >
                                    {skill.name}
                                  </button>
                                ) : (
                                  <div className="truncate font-medium text-foreground">{skill.name}</div>
                                )}
                                {skill.description ? (
                                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                    {skill.description}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        );
                      }
                      if (column === "source") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{sourceLabel(skill)}</td>;
                      }
                      if (column === "createdAt") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{formatDate(skill.createdAt)}</td>;
                      }
                      if (column === "updatedAt") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{formatDate(skill.updatedAt)}</td>;
                      }
                      if (column === "installStatus") {
                        return (
                          <td key={column} className="px-3 py-2 text-muted-foreground">
                            <div className="flex flex-col gap-1">
                              {skill.sourceType ? (
                                <SourceIndicator
                                  sourceType={skill.sourceType}
                                  sourceLocation={skill.sourceLocation}
                                />
                              ) : (
                                <span>{installStatusLabel(t, skill)}</span>
                              )}
                              {skill.originKind ? (
                                <SourceOriginBadge originKind={skill.originKind} />
                              ) : null}
                              {skill.isReadOnly ? <ReadOnlyBadge /> : null}
                              <InstallStatusIcons skill={skill} />
                            </div>
                          </td>
                        );
                      }
                      if (column === "rating") {
                        return (
                          <td key={column} className="px-3 py-2 text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Star className="size-3.5" />
                              -
                            </span>
                          </td>
                        );
                      }
                      if (column === "tags") {
                        return (
                          <td key={column} className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(skill.tags ?? []).slice(0, 4).map((tag) => (
                                <span
                                  key={tag.key}
                                  className="rounded-md bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground"
                                >
                                  #{tag.label}
                                </span>
                              ))}
                            </div>
                          </td>
                        );
                      }
                      if (column === "notes") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground"><NotesCell notes={skill.notes} /></td>;
                      }
                      return <td key={column} className="px-3 py-2"><SkillActions skill={skill} /></td>;
                    })}
                  </tr>
                ))
              : folders.map((folder) => (
                  <tr key={folder.key} className="align-top transition-colors hover:bg-muted/25">
                    {activeColumns.map((column) => {
                      if (column === "name") {
                        return (
                          <td key={column} className="px-3 py-2">
                            <button
                              type="button"
                              className="block max-w-full truncate text-left font-medium text-foreground hover:text-primary hover:underline"
                              onClick={folder.onOpen}
                            >
                              {folder.name}
                            </button>
                            {folder.previewNames?.length ? (
                              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                {folder.previewNames.slice(0, 3).join(", ")}
                              </p>
                            ) : null}
                          </td>
                        );
                      }
                      if (column === "path") {
                        return (
                          <td key={column} className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {formatPathForDisplay(folder.path)}
                          </td>
                        );
                      }
                      if (column === "skillCount") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{folder.skillCount}</td>;
                      }
                      if (column === "installSummary") {
                        return (
                          <td key={column} className="px-3 py-2 text-muted-foreground">
                            {t("skillBrowser.folderInstallSummary", {
                              linked: folder.linkedAgentCount ?? 0,
                              shared: folder.readOnlyAgentCount ?? 0,
                            })}
                          </td>
                        );
                      }
                      if (column === "createdAt") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{formatDate(folder.createdAt)}</td>;
                      }
                      if (column === "updatedAt") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{formatDate(folder.updatedAt)}</td>;
                      }
                      if (column === "notesSummary") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground"><NotesCell notes={folder.notesSummary} /></td>;
                      }
                      return (
                        <td key={column} className="px-3 py-2">
                          <div className="flex justify-start gap-1">
                            {folder.onAddToCentral ? (
                              <ActionButton
                                label={folder.addToCentralLabel ?? t("discover.installToCentral")}
                                disabled={folder.isAddingToCentral}
                                onClick={folder.onAddToCentral}
                              >
                                {folder.isAddingToCentral ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Database className="size-4" />
                                )}
                              </ActionButton>
                            ) : null}
                            {folder.onInstall ? (
                              <ActionButton
                                label={folder.installLabel ?? t("central.installTo")}
                                disabled={folder.isInstalling}
                                onClick={folder.onInstall}
                              >
                                {folder.isInstalling ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <PackagePlus className="size-4" />
                                )}
                              </ActionButton>
                            ) : null}
                            {folder.onUninstall ? (
                              <ActionButton
                                label={folder.uninstallLabel ?? t("common.uninstall")}
                                disabled={folder.isUninstalling}
                                onClick={folder.onUninstall}
                              >
                                {folder.isUninstalling ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <PackageMinus className="size-4" />
                                )}
                              </ActionButton>
                            ) : null}
                            {folder.onDelete ? (
                              <ActionButton
                                label={folder.deleteLabel ?? t("common.delete")}
                                disabled={folder.isDeleting}
                                destructive
                                onClick={folder.onDelete}
                              >
                                <Trash2 className="size-4" />
                              </ActionButton>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {columnMenu ? (
        <div
          role="menu"
          aria-label={t("skillBrowser.columnSettings")}
          className="fixed z-50 w-56 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg"
          style={{ left: columnMenu.x, top: columnMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">
            {t("skillBrowser.visibleColumns")}
          </div>
          <div className="space-y-1">
            {columnOptions.map((option) => {
              const fixed = option.fixed || FIXED_COLUMNS.has(option.key);
              return (
                <label
                  key={option.key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                    fixed ? "text-muted-foreground" : "cursor-pointer hover:bg-muted"
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={t(option.labelKey)}
                    checked={visibleColumns.has(option.key)}
                    disabled={fixed}
                    onChange={() => onToggleColumn?.(option.key)}
                    className="size-3.5 accent-primary"
                  />
                  <span>{t(option.labelKey)}</span>
                  {fixed ? (
                    <span className="ml-auto text-[0.68rem] text-muted-foreground">
                      {t("skillBrowser.fixedColumn")}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          {onResetColumns ? (
            <div className="mt-2 border-t border-border pt-2">
              <button
                type="button"
                className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={onResetColumns}
              >
                {t("skillBrowser.resetColumns")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
