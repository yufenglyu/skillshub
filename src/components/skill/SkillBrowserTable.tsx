import {
  Check,
  Database,
  FolderOpen,
  Link2,
  Lock,
  Loader2,
  PackageMinus,
  PackagePlus,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
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
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { InlineConfirmAction } from "@/components/ui/inline-confirm-action";
import type { SkillTableKind } from "@/hooks/useSkillTableColumns";
import { FIXED_SKILL_COLUMNS } from "@/hooks/useSkillTableColumns";
import { optionsForSkillTable } from "@/components/skill/skillColumnOptions";
import { formatPathForDisplay } from "@/lib/path";
import {
  getSkillSourceLineKeys,
  isExceptionalSkillOrigin,
} from "@/lib/skillSourceDisplay";
import {
  nextSkillSortDirection,
  type SkillSortDirection,
  type SkillSortField,
} from "@/lib/skillSort";
import { cn } from "@/lib/utils";
import type { AgentWithStatus, ClaudeSourceKind } from "@/types";
import type { UnifiedSkillCardProps } from "@/components/skill/UnifiedSkillCard";
import {
  buildInstallSummary,
  formatInstallSummaryTooltip,
} from "@/lib/installSummary";

export interface FolderTableItem {
  key: string;
  name: string;
  path: string;
  skillCount: number;
  linkedAgentCount?: number;
  readOnlyAgentCount?: number;
  installAgents?: AgentWithStatus[];
  installLinkedAgentIds?: string[];
  installReadOnlyAgentIds?: string[];
  previewNames?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  onOpen: () => void;
  onAddToCentral?: () => void;
  addToCentralLabel?: string;
  isAddingToCentral?: boolean;
  onRemoveFromCentral?: () => void;
  removeFromCentralLabel?: string;
  isRemovingFromCentral?: boolean;
  onInstall?: () => void;
  installLabel?: string;
  isInstalling?: boolean;
  onUninstall?: () => void;
  uninstallLabel?: string;
  isUninstalling?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  isDeleting?: boolean;
  deleteRequiresConfirmation?: boolean;
}

export interface SkillTableItem extends UnifiedSkillCardProps {
  installLinkedCount?: number;
  installReadOnlyCount?: number;
  installAgents?: AgentWithStatus[];
  installLinkedAgentIds?: string[];
  installReadOnlyAgentIds?: string[];
  onRemoveFromCentral?: () => void;
  removeFromCentralLabel?: string;
  installToLabel?: string;
  removeLabel?: string;
}

interface SkillBrowserTableProps {
  kind: SkillTableKind;
  visibleColumns: Set<string>;
  skills?: SkillTableItem[];
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
  index: 40,
  name: 384,
  source: 180,
  createdAt: 140,
  updatedAt: 140,
  installSummary: 240,
  tags: 180,
  notes: 256,
  path: 448,
  skillCount: 100,
  actions: 120,
};
const MIN_COLUMN_WIDTH = 80;
const MIN_INDEX_COLUMN_WIDTH = 32;
const MAX_AUTO_COLUMN_WIDTH = 640;
const COLUMN_WIDTH_EVENT = "skills-manage:skill-table-widths";
function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function sourceLabel(skill: UnifiedSkillCardProps) {
  return skill.sourceRepo ?? skill.sourceAuthor ?? skill.publisher ?? "-";
}

function installSummaryFromIds(
  linkedAgentIds: readonly string[] | null | undefined,
  readOnlyAgentIds: readonly string[] | null | undefined,
  agents: readonly AgentWithStatus[] | null | undefined
) {
  return buildInstallSummary(linkedAgentIds, readOnlyAgentIds, agents);
}

function InstallSummaryCell({
  linkedAgentIds,
  readOnlyAgentIds,
  agents,
}: {
  linkedAgentIds: readonly string[];
  readOnlyAgentIds: readonly string[];
  agents: readonly AgentWithStatus[];
}) {
  const { t } = useTranslation();
  const summary = installSummaryFromIds(linkedAgentIds, readOnlyAgentIds, agents);
  const tooltip = formatInstallSummaryTooltip(t, summary);
  const directTotal = summary.directPlatforms.length + summary.directProjects.length;
  const directLabel = t("skillBrowser.installSummaryDirect", {
    total: directTotal,
    platforms: summary.directPlatforms.length,
    projects: summary.directProjects.length,
  });
  const sharedLabel = t("skillBrowser.installSummaryShared", {
    total: summary.shared.length,
  });

  return (
    <div
      className="flex flex-col gap-0.5 text-xs leading-5 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={tooltip}
      tabIndex={0}
      aria-label={`${directLabel}. ${sharedLabel}. ${tooltip}`}
    >
      <span>{directLabel}</span>
      <span>{sharedLabel}</span>
    </div>
  );
}

function skillInstallSummaryProps(skill: SkillTableItem) {
  return {
    linkedAgentIds:
      skill.installLinkedAgentIds ?? skill.platformIcons?.linkedAgents ?? [],
    readOnlyAgentIds:
      skill.installReadOnlyAgentIds ?? skill.platformIcons?.readOnlyAgents ?? [],
    agents: skill.installAgents ?? skill.platformIcons?.agents ?? [],
  };
}

function folderInstallSummaryProps(folder: FolderTableItem) {
  return {
    linkedAgentIds: folder.installLinkedAgentIds ?? [],
    readOnlyAgentIds: folder.installReadOnlyAgentIds ?? [],
    agents: folder.installAgents ?? [],
  };
}

function ActionButton({
  label,
  onClick,
  disabled,
  children,
  destructive = false,
}: {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
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

function DatabaseActionIcon({ installed }: { installed: boolean }) {
  const Badge = installed ? Minus : Plus;
  return (
    <span className="relative inline-flex size-4">
      <Database className="size-4" />
      <Badge className="absolute -bottom-1 -right-1 size-2.5 rounded-full bg-card stroke-[3]" />
    </span>
  );
}

function SkillActions({ skill }: { skill: SkillTableItem }) {
  const { t } = useTranslation();
  const busy = !!skill.isLoading;
  const actions = [];

  if (skill.onInstallToCentral && !skill.isCentral) {
    actions.push(
      <ActionButton
        key="central"
        label={skill.installToCentralLabel ?? t("resource.addToCentralAction")}
        disabled={busy}
        onClick={skill.onInstallToCentral}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <DatabaseActionIcon installed={false} />}
      </ActionButton>
    );
  }

  if (skill.onRemoveFromCentral && skill.isCentral) {
    actions.push(
      <InlineConfirmAction
        key="central"
        onConfirm={skill.onRemoveFromCentral}
        isLoading={busy}
        idleTitle={skill.removeFromCentralLabel ?? t("resource.removeFromCentralAction")}
        idleAriaLabel={skill.removeFromCentralLabel ?? t("resource.removeFromCentralAction")}
        confirmLabel={t("common.confirmDelete")}
        icon={<DatabaseActionIcon installed />}
      />
    );
  }

  if (skill.onUninstallFromPlatform) {
    actions.push(
      <InlineConfirmAction
        key="install-to"
        onConfirm={skill.onUninstallFromPlatform}
        isLoading={busy}
        idleTitle={skill.uninstallFromLabel ?? t("resource.uninstallFromTargetsAction")}
        idleAriaLabel={skill.uninstallFromLabel ?? t("resource.uninstallFromTargetsAction")}
        confirmLabel={t("common.confirmDelete")}
        icon={<PackageMinus className="size-4" />}
      />
    );
  } else if (skill.onInstallTo) {
    actions.push(
      <ActionButton
        key="install-to"
        label={skill.installToLabel ?? t("resource.installToTargetsAction")}
        disabled={busy}
        onClick={skill.onInstallTo}
      >
        <PackagePlus className="size-4" />
      </ActionButton>
    );
  }

  if (skill.onUpdateFromSource || skill.updateFromSourceLabel) {
    actions.push(
      <ActionButton
        key="update"
        label={skill.updateFromSourceLabel ?? t("resource.updateAction")}
        disabled={busy || !skill.onUpdateFromSource}
        onClick={() => skill.onUpdateFromSource?.()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      </ActionButton>
    );
  }

  if (skill.onDeleteFromCentral) {
    actions.push(
      skill.deleteFromCentralRequiresDialog ? (
        <ActionButton
          key="delete"
          label={skill.deleteFromCentralLabel ?? t("resource.deleteAction")}
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
          idleTitle={skill.deleteFromCentralLabel ?? t("resource.deleteAction")}
          idleAriaLabel={skill.deleteFromCentralLabel ?? t("resource.deleteAction")}
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
        idleTitle={skill.removeLabel ?? t("resource.deleteAction")}
        idleAriaLabel={skill.removeLabel ?? t("resource.deleteAction")}
        confirmLabel={t("common.confirmDelete")}
        icon={<Trash2 className="size-4" />}
      />
    );
  }

  return <div className="flex justify-start gap-1">{actions}</div>;
}

function SourceIndicator({
  sourceType,
  sourceLocation = "standalone",
}: {
  sourceType: "symlink" | "copy" | "native";
  sourceLocation?: "central" | "resource-library" | "standalone";
}) {
  const { t } = useTranslation();
  const isSymlink = sourceType === "symlink";
  const { label, hint } = getSkillSourceLineKeys(sourceType, sourceLocation);

  return (
    <div
      className={cn("inline-flex items-center gap-1 text-xs font-medium", isSymlink ? "text-primary/80" : "text-muted-foreground")}
      title={t(hint)}
    >
      {isSymlink ? <Link2 className="size-3 shrink-0" /> : <FolderOpen className="size-3 shrink-0" />}
      <span>{t(label)}</span>
    </div>
  );
}

function SourceOriginBadge({ originKind }: { originKind: ClaudeSourceKind }) {
  const { t } = useTranslation();
  const isPlugin = originKind === "plugin";
  const isCompatibility = originKind === "compatibility";
  const label = isPlugin
    ? t("platform.originPlugin")
    : isCompatibility
      ? t("platform.originCompatibility")
      : t("platform.originUser");
  const hint = isPlugin
    ? t("platform.originPluginHint")
    : isCompatibility
      ? t("platform.originCompatibilityHint")
      : t("platform.originUserHint");
  return (
    <span
      title={hint}
      className={cn(
      "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
      isPlugin
        ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300"
        : isCompatibility
          ? "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300"
          : "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300"
    )}
    >
      {label}
    </span>
  );
}

function ReadOnlyBadge() {
  const { t, i18n } = useTranslation();
  const label = t("platform.readOnly", {
    defaultValue: i18n.language.startsWith("zh") ? "只读" : "Read-only",
  });
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/70">
      <Lock className="size-3 shrink-0" />
      {label}
    </span>
  );
}

function NotesCell({ notes }: { notes?: string | null }) {
  if (!notes?.trim()) return <span className="text-muted-foreground">-</span>;
  return <span className="line-clamp-2">{notes.trim()}</span>;
}

function minColumnWidth(column: string) {
  return column === "index" ? MIN_INDEX_COLUMN_WIDTH : MIN_COLUMN_WIDTH;
}

function cellHorizontalPadding(column: string) {
  return column === "index" ? 16 : 24;
}

function clampAutoFitWidth(column: string, measured: number) {
  const capped =
    column === "notes" || column === "tags"
      ? Math.min(measured, DEFAULT_COLUMN_WIDTHS[column] ?? 256)
      : Math.min(measured, MAX_AUTO_COLUMN_WIDTH);
  return Math.max(minColumnWidth(column), capped);
}

function fitLabelsForCell(cell: HTMLTableCellElement): string[] {
  const truncated = Array.from(cell.querySelectorAll(".truncate"))
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean);
  if (truncated.length > 0) return truncated;

  const labels: string[] = [];
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) labels.push(text);
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    if (child.getAttribute("role") === "separator") continue;
    const text = (child.innerText ?? child.textContent ?? "").trim();
    if (!text) continue;
    for (const line of text.split(/\n+/)) {
      const label = line.trim();
      if (label) labels.push(label);
    }
  }
  return labels;
}

function estimateGlyphWidth(text: string) {
  let width = 0;
  for (const character of text) {
    width += character.charCodeAt(0) > 255 ? 13 : 7;
  }
  return width;
}

function measureTextWidth(text: string, sample: HTMLElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context) {
    const style = window.getComputedStyle(sample);
    const font = style.font && style.font !== "" ? style.font : `${style.fontSize} ${style.fontFamily}`;
    if (font.trim()) {
      context.font = font;
      const measured = context.measureText(text).width;
      if (measured > 0) return measured;
    }
  }
  return estimateGlyphWidth(text);
}

function measureCellFitWidth(cell: HTMLTableCellElement, column: string) {
  const labels = fitLabelsForCell(cell);
  if (labels.length === 0) return minColumnWidth(column);

  let contentWidth = 0;
  for (const label of labels) {
    contentWidth = Math.max(contentWidth, measureTextWidth(label, cell));
  }
  const extras =
    (cell.querySelector("input[type='checkbox']") ? 24 : 0) +
    (cell.querySelector("[aria-hidden='true']") ? 14 : 0);
  return Math.ceil(contentWidth + cellHorizontalPadding(column) + extras);
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
          const [key, value] = entry;
          return Number.isFinite(value) && value >= minColumnWidth(key);
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
  const tableRef = useRef<HTMLTableElement | null>(null);
  const columns =
    kind === "skill"
      ? ["index", "name", "source", "createdAt", "updatedAt", "installSummary", "tags", "notes", "actions"]
      : ["index", "name", "path", "skillCount", "createdAt", "updatedAt", "installSummary", "actions"];
  const activeColumns = columns.filter(
    (column) => column === "index" || visibleColumns.has(column)
  );
  const columnOptions = useMemo(() => optionsForSkillTable(kind), [kind]);
  const resolvedColumnWidths = useMemo(
    () =>
      Object.fromEntries(
        activeColumns.map((column) => [
          column,
          columnWidths[column] ?? DEFAULT_COLUMN_WIDTHS[column] ?? 140,
        ])
      ),
    [activeColumns, columnWidths]
  );
  const tableWidth = activeColumns.reduce(
    (total, column) => total + resolvedColumnWidths[column],
    0
  );

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
      const width = Math.max(
        minColumnWidth(state.column),
        state.startWidth + moveEvent.clientX - state.startX
      );
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

  function handleAutoSizeColumn(
    event: ReactMouseEvent<HTMLSpanElement>,
    column: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    const columnIndex = activeColumns.indexOf(column);
    if (columnIndex < 0 || !tableRef.current) return;

    const measuredWidth = Array.from(tableRef.current.rows).reduce((maximum, row) => {
      const cell = row.cells.item(columnIndex);
      if (!cell) return maximum;
      return Math.max(maximum, measureCellFitWidth(cell, column));
    }, minColumnWidth(column));
    const width = clampAutoFitWidth(column, measuredWidth);
    setColumnWidths((previous) => {
      const next = { ...previous, [column]: width };
      persistColumnWidths(next);
      return next;
    });
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
        <table
          ref={tableRef}
          className="table-fixed min-w-full text-left text-sm"
          style={{ width: `${tableWidth}px` }}
        >
          <colgroup>
            {activeColumns.map((column) => (
              <col
                key={column}
                style={{ width: `${resolvedColumnWidths[column]}px` }}
              />
            ))}
          </colgroup>
          <thead className="border-b border-border bg-muted/35 text-xs font-medium text-muted-foreground">
            <tr>
              {activeColumns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  aria-label={t(`skillBrowser.columns.${column}`)}
                  onContextMenu={handleHeaderContextMenu}
                  className={cn(
                    "relative py-2 font-medium",
                    column === "index" ? "px-2" : "px-3"
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
                      onDoubleClick={(event) => handleAutoSizeColumn(event, column)}
                      className="group/resize absolute inset-y-0 right-0 w-2 translate-x-1/2 cursor-col-resize focus-visible:outline-none"
                    >
                      <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-border transition-all group-hover/resize:w-0.5 group-hover/resize:bg-primary/60 group-focus-visible/resize:w-0.5 group-focus-visible/resize:bg-primary/60" />
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {kind === "skill"
              ? skills.map((skill, skillIndex) => (
                  <tr key={skill.rowKey ?? skill.name} className="align-top transition-colors hover:bg-muted/25">
                    {activeColumns.map((column) => {
                      if (column === "index") {
                        return (
                          <td
                            key={column}
                            className="px-2 py-2 tabular-nums text-muted-foreground"
                          >
                            {skillIndex + 1}
                          </td>
                        );
                      }
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
                                    ref={skill.detailButtonRef}
                                    type="button"
                                    className="block max-w-full truncate text-left font-medium text-foreground hover:text-primary hover:underline"
                                    aria-label={t("central.viewDetailsLabel", {
                                      name: skill.name,
                                    })}
                                    onClick={skill.onDetail}
                                  >
                                    {skill.name}
                                  </button>
                                ) : (
                                  <div className="truncate font-medium text-foreground">{skill.name}</div>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      }
                      if (column === "source") {
                        return (
                          <td key={column} className="px-3 py-2 text-muted-foreground">
                            <div className="flex flex-col gap-1">
                              <span>{sourceLabel(skill)}</span>
                              {skill.sourceType ? (
                                <SourceIndicator
                                  sourceType={skill.sourceType}
                                  sourceLocation={skill.sourceLocation}
                                />
                              ) : null}
                              {isExceptionalSkillOrigin(skill.originKind) ? (
                                <SourceOriginBadge originKind={skill.originKind} />
                              ) : null}
                              {skill.isReadOnly ? <ReadOnlyBadge /> : null}
                            </div>
                          </td>
                        );
                      }
                      if (column === "createdAt") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{formatDate(skill.createdAt)}</td>;
                      }
                      if (column === "updatedAt") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{formatDate(skill.updatedAt)}</td>;
                      }
                      if (column === "installSummary") {
                        const summaryProps = skillInstallSummaryProps(skill);
                        return (
                          <td key={column} className="px-3 py-2">
                            <InstallSummaryCell {...summaryProps} />
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
              : folders.map((folder, folderIndex) => (
                  <tr key={folder.key} className="align-top transition-colors hover:bg-muted/25">
                    {activeColumns.map((column) => {
                      if (column === "index") {
                        return (
                          <td
                            key={column}
                            className="px-2 py-2 tabular-nums text-muted-foreground"
                          >
                            {folderIndex + 1}
                          </td>
                        );
                      }
                      if (column === "name") {
                        return (
                          <td key={column} className="overflow-hidden px-3 py-2">
                            <button
                              type="button"
                              className="block w-0 min-w-full truncate text-left font-medium text-foreground hover:text-primary hover:underline"
                              onClick={folder.onOpen}
                            >
                              {folder.name}
                            </button>
                          </td>
                        );
                      }
                      if (column === "path") {
                        const displayedPath = formatPathForDisplay(folder.path);
                        return (
                          <td
                            key={column}
                            className="overflow-hidden px-3 py-2 font-mono text-xs text-muted-foreground"
                          >
                            <span className="block w-0 min-w-full truncate" title={displayedPath}>
                              {displayedPath}
                            </span>
                          </td>
                        );
                      }
                      if (column === "skillCount") {
                        return (
                          <td key={column} className="relative overflow-hidden px-3 py-2 text-muted-foreground">
                            {folder.skillCount}
                          </td>
                        );
                      }
                      if (column === "installSummary") {
                        const summaryProps = folderInstallSummaryProps(folder);
                        return (
                          <td key={column} className="px-3 py-2">
                            <InstallSummaryCell {...summaryProps} />
                          </td>
                        );
                      }
                      if (column === "createdAt") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{formatDate(folder.createdAt)}</td>;
                      }
                      if (column === "updatedAt") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{formatDate(folder.updatedAt)}</td>;
                      }
                      return (
                        <td key={column} className="px-3 py-2">
                          <div className="flex justify-start gap-1">
                            {folder.onAddToCentral ? (
                              <ActionButton
                                label={folder.addToCentralLabel ?? t("resource.addToCentralAction")}
                                disabled={folder.isAddingToCentral}
                                onClick={folder.onAddToCentral}
                              >
                                {folder.isAddingToCentral ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <DatabaseActionIcon installed={false} />
                                )}
                              </ActionButton>
                            ) : null}
                            {folder.onRemoveFromCentral ? (
                              <InlineConfirmAction
                                onConfirm={folder.onRemoveFromCentral}
                                isLoading={folder.isRemovingFromCentral}
                                idleTitle={
                                  folder.removeFromCentralLabel ??
                                  t("resource.removeFromCentralAction")
                                }
                                idleAriaLabel={
                                  folder.removeFromCentralLabel ??
                                  t("resource.removeFromCentralAction")
                                }
                                confirmLabel={t("common.confirmDelete")}
                                icon={<DatabaseActionIcon installed />}
                              />
                            ) : null}
                            {folder.onUninstall ? (
                              <ActionButton
                                label={folder.uninstallLabel ?? t("resource.uninstallFromTargetsAction")}
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
                            {!folder.onUninstall && folder.onInstall ? (
                              <ActionButton
                                label={folder.installLabel ?? t("resource.installToTargetsAction")}
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
                            {folder.onDelete ? (
                              folder.deleteRequiresConfirmation ? (
                                <InlineConfirmAction
                                  onConfirm={folder.onDelete}
                                  isLoading={folder.isDeleting}
                                  idleTitle={folder.deleteLabel ?? t("resource.deleteAction")}
                                  idleAriaLabel={folder.deleteLabel ?? t("resource.deleteAction")}
                                  confirmLabel={t("common.confirmDelete")}
                                  icon={<Trash2 className="size-4" />}
                                />
                              ) : (
                                <ActionButton
                                  label={folder.deleteLabel ?? t("resource.deleteAction")}
                                  disabled={folder.isDeleting}
                                  destructive
                                  onClick={folder.onDelete}
                                >
                                  <Trash2 className="size-4" />
                                </ActionButton>
                              )
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
