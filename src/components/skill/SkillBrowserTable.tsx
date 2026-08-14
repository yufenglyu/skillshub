import {
  Check,
  Database,
  ExternalLink,
  Loader2,
  PackageMinus,
  PackagePlus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { InlineConfirmAction } from "@/components/ui/inline-confirm-action";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import type { SkillTableKind } from "@/hooks/useSkillTableColumns";
import { formatPathForDisplay } from "@/lib/path";
import { cn } from "@/lib/utils";
import type { AgentWithStatus } from "@/types";
import type { UnifiedSkillCardProps } from "@/components/skill/UnifiedSkillCard";

export interface FolderTableItem {
  key: string;
  name: string;
  path: string;
  skillCount: number;
  linkedAgentCount?: number;
  readOnlyAgentCount?: number;
  previewNames?: string[];
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
  className?: string;
}

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

function linkedAgents(skill: UnifiedSkillCardProps) {
  const ids = new Set(skill.platformIcons?.linkedAgents ?? []);
  const readOnlyIds = new Set(skill.platformIcons?.readOnlyAgents ?? []);
  const agents = skill.platformIcons?.agents ?? [];
  return agents.filter((agent) => ids.has(agent.id) || readOnlyIds.has(agent.id));
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

  return <div className="flex justify-end gap-1">{actions}</div>;
}

function InstallStatusIcons({ skill }: { skill: UnifiedSkillCardProps }) {
  const agents = linkedAgents(skill).slice(0, 8);
  if (agents.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {agents.map((agent: AgentWithStatus) => (
        <PlatformIcon
          key={agent.id}
          agentId={agent.id}
          className="size-3.5 opacity-70"
          size={14}
        />
      ))}
    </span>
  );
}

function NotesCell({ notes }: { notes?: string | null }) {
  if (!notes?.trim()) return <span className="text-muted-foreground">-</span>;
  return <span className="line-clamp-2">{notes.trim()}</span>;
}

export function SkillBrowserTable({
  kind,
  visibleColumns,
  skills = [],
  folders = [],
  className,
}: SkillBrowserTableProps) {
  const { t } = useTranslation();
  const columns =
    kind === "skill"
      ? ["name", "source", "createdAt", "updatedAt", "installStatus", "rating", "tags", "notes", "actions"]
      : ["name", "path", "skillCount", "installSummary", "updatedAt", "notesSummary", "actions"];
  const activeColumns = columns.filter((column) => visibleColumns.has(column));

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="border-b border-border bg-muted/35 text-xs font-medium text-muted-foreground">
            <tr>
              {activeColumns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    "px-3 py-2 font-medium",
                    column === "name" && "w-[24rem]",
                    column === "actions" && "w-36 text-right",
                    column === "notes" && "w-64",
                    column === "path" && "w-[28rem]"
                  )}
                >
                  {t(`skillBrowser.columns.${column}`)}
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
                              {skill.checkbox ? (
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
                              <span>{installStatusLabel(t, skill)}</span>
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
                      if (column === "updatedAt") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground">{formatDate(folder.updatedAt)}</td>;
                      }
                      if (column === "notesSummary") {
                        return <td key={column} className="px-3 py-2 text-muted-foreground"><NotesCell notes={folder.notesSummary} /></td>;
                      }
                      return (
                        <td key={column} className="px-3 py-2">
                          <div className="flex justify-end gap-1">
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
    </div>
  );
}
