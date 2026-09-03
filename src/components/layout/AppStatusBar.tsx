import { AlertCircle, CheckCircle2, Circle, Loader2, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import { useAppStatusStore, type AppStatusTask } from "@/stores/appStatusStore";
import { cn } from "@/lib/utils";

type UpdateStatsFilter = "updated" | "unchanged" | "deleted" | "skipped" | "failed";

function statusIcon(task: AppStatusTask | null) {
  if (!task) return <Circle className="size-3 fill-current text-muted-foreground" />;
  if (task.status === "running") {
    return <Loader2 className="size-3.5 animate-spin text-primary" />;
  }
  if (task.status === "success") {
    return <CheckCircle2 className="size-3.5 text-emerald-600" />;
  }
  if (task.status === "error") {
    return <AlertCircle className="size-3.5 text-destructive" />;
  }
  return <Circle className="size-3 fill-current text-muted-foreground" />;
}

function itemStatusLabel(
  t: (key: string) => string,
  status: NonNullable<AppStatusTask["items"]>[number]["status"]
) {
  if (status === "updated") return t("status.itemUpdated");
  if (status === "unchanged") return t("status.itemUnchanged");
  if (status === "deleted") return t("status.itemDeleted");
  if (status === "skipped") return t("status.itemSkipped");
  if (status === "failed") return t("status.itemFailed");
  return t("status.itemSkipped");
}

export function AppStatusBar() {
  const { t } = useTranslation();
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [statsFilter, setStatsFilter] = useState<UpdateStatsFilter | null>(null);
  const task = useAppStatusStore((state) => state.task);
  const resourceSkills = useResourceLibraryStore((state) => state.skills?.length ?? 0);
  const centralSkills = useCentralSkillsStore((state) => state.skills?.length ?? 0);

  const label = task?.label ?? t("status.ready");
  const detail = task?.detail ?? t("status.summary", {
    resources: resourceSkills,
    central: centralSkills,
  });
  const statusTitle =
    task?.error && task.error !== detail ? `${label}: ${detail} (${task.error})` : `${label}: ${detail}`;
  const hasStats =
    task &&
    (typeof task.updatedCount === "number" ||
      typeof task.unchangedCount === "number" ||
      typeof task.deletedCount === "number" ||
      typeof task.skippedCount === "number" ||
      typeof task.failedCount === "number" ||
      (task.items?.length ?? 0) > 0);
  const currentCount = task?.currentCount ?? 0;
  const totalCount = task?.totalCount ?? 0;
  const showProgress = task?.status === "running" && totalCount > 0;
  const progressPercent = showProgress
    ? Math.min(100, Math.round((currentCount / totalCount) * 100))
    : 0;
  const progressLabel = showProgress
    ? t("status.resourceSourceProgressAria", {
        current: currentCount,
        total: totalCount,
        name: detail,
      })
    : detail;
  const statsItems = useMemo(() => task?.items ?? [], [task?.items]);
  const filteredStatsItems = useMemo(
    () => (statsFilter ? statsItems.filter((item) => item.status === statsFilter) : statsItems),
    [statsFilter, statsItems]
  );
  const hasFailedItemActions =
    !!task?.onRetryFailedItem || !!task?.onManualCheckFailedItem;

  function toggleStatsFilter(filter: UpdateStatsFilter) {
    setStatsFilter((current) => (current === filter ? null : filter));
  }

  function statsCardClass(filter: UpdateStatsFilter) {
    return cn(
      "rounded-lg border p-3 text-left transition-colors",
      "hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      statsFilter === filter ? "border-primary bg-primary/5" : "border-border"
    );
  }

  return (
    <>
      <footer
        className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border bg-card/95 px-3 text-xs text-muted-foreground"
        aria-label={t("status.label")}
        title={statusTitle}
      >
        <div className="flex min-w-0 items-center gap-2">
          {statusIcon(task)}
          <span
            className={cn(
              "shrink-0 font-medium",
              task?.status === "error" && "text-destructive",
              task?.status === "success" && "text-foreground",
              task?.status === "running" && "text-foreground"
            )}
          >
            {label}
          </span>
          <span className="truncate">{detail}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showProgress ? (
            <>
              <span className="tabular-nums text-foreground">
                {t("status.resourceSourceProgressCount", {
                  current: currentCount,
                  total: totalCount,
                })}
              </span>
              <div
                className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={totalCount}
                aria-valuenow={currentCount}
                aria-label={progressLabel}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </>
          ) : null}
          {hasStats ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 gap-2 px-2 text-xs text-muted-foreground"
              onClick={() => setIsStatsOpen(true)}
              aria-label={t("status.viewUpdateStats")}
            >
              {typeof task?.updatedCount === "number" ? (
                <span>{t("status.updatedCount", { count: task.updatedCount })}</span>
              ) : null}
              {typeof task?.unchangedCount === "number" ? (
                <span>{t("status.unchangedCount", { count: task.unchangedCount })}</span>
              ) : null}
              {typeof task?.deletedCount === "number" ? (
                <span>{t("status.deletedCount", { count: task.deletedCount })}</span>
              ) : null}
              {typeof task?.skippedCount === "number" ? (
                <span>{t("status.skippedCount", { count: task.skippedCount })}</span>
              ) : null}
              {typeof task?.failedCount === "number" ? (
                <span className={task.failedCount > 0 ? "text-destructive" : undefined}>
                  {t("status.failedCount", { count: task.failedCount })}
                </span>
              ) : null}
            </Button>
          ) : null}
        </div>
      </footer>

      <Dialog open={isStatsOpen} onOpenChange={setIsStatsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("status.updateStats")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <button
              type="button"
              className={statsCardClass("updated")}
              aria-pressed={statsFilter === "updated"}
              onClick={() => toggleStatsFilter("updated")}
            >
              <div className="text-xs text-muted-foreground">{t("status.updatedLabel")}</div>
              <div className="mt-1 text-xl font-semibold text-foreground">{task?.updatedCount ?? 0}</div>
            </button>
            <button
              type="button"
              className={statsCardClass("unchanged")}
              aria-pressed={statsFilter === "unchanged"}
              onClick={() => toggleStatsFilter("unchanged")}
            >
              <div className="text-xs text-muted-foreground">{t("status.unchangedLabel")}</div>
              <div className="mt-1 text-xl font-semibold text-foreground">{task?.unchangedCount ?? 0}</div>
            </button>
            <button
              type="button"
              className={statsCardClass("deleted")}
              aria-pressed={statsFilter === "deleted"}
              onClick={() => toggleStatsFilter("deleted")}
            >
              <div className="text-xs text-muted-foreground">{t("status.deletedLabel")}</div>
              <div className="mt-1 text-xl font-semibold text-amber-600">{task?.deletedCount ?? 0}</div>
            </button>
            <button
              type="button"
              className={statsCardClass("skipped")}
              aria-pressed={statsFilter === "skipped"}
              onClick={() => toggleStatsFilter("skipped")}
            >
              <div className="text-xs text-muted-foreground">{t("status.skippedLabel")}</div>
              <div className="mt-1 text-xl font-semibold text-foreground">{task?.skippedCount ?? 0}</div>
            </button>
            <button
              type="button"
              className={statsCardClass("failed")}
              aria-pressed={statsFilter === "failed"}
              onClick={() => toggleStatsFilter("failed")}
            >
              <div className="text-xs text-muted-foreground">{t("status.failedLabel")}</div>
              <div className="mt-1 text-xl font-semibold text-destructive">{task?.failedCount ?? 0}</div>
            </button>
          </div>
          <DialogBody className="px-0">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-12 border-b border-border px-3 py-2 font-medium">{t("status.columnIndex")}</th>
                  <th className="border-b border-border px-3 py-2 font-medium">{t("status.columnName")}</th>
                  <th className="border-b border-border px-3 py-2 font-medium">{t("status.columnRepository")}</th>
                  <th className="w-28 border-b border-border px-3 py-2 font-medium">{t("status.columnStatus")}</th>
                  {hasFailedItemActions ? (
                    <th className="w-40 border-b border-border px-3 py-2 font-medium">{t("status.columnActions")}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filteredStatsItems.map((item, index) => (
                  <tr key={`${item.status}:${item.name}:${item.repository ?? ""}:${index}`} title={item.detail ?? undefined}>
                    <td className="border-b border-border px-3 py-2 tabular-nums text-muted-foreground">{index + 1}</td>
                    <td className="border-b border-border px-3 py-2 font-medium text-foreground">{item.name}</td>
                    <td className="border-b border-border px-3 py-2 text-muted-foreground">{item.repository || "-"}</td>
                    <td
                      className={cn(
                        "border-b border-border px-3 py-2 text-xs",
                        item.status === "failed" && "text-destructive",
                        item.status === "updated" && "text-emerald-600",
                        item.status === "deleted" && "text-amber-600",
                        item.status === "unchanged" && "text-foreground",
                        item.status === "skipped" && "text-muted-foreground"
                      )}
                    >
                      {itemStatusLabel(t, item.status)}
                    </td>
                    {hasFailedItemActions ? (
                      <td className="border-b border-border px-3 py-2">
                        {item.status === "failed" ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {task?.onRetryFailedItem ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => task.onRetryFailedItem?.(item)}
                              >
                                <RotateCw className="size-3" />
                                {t("status.retryFailedItem")}
                              </Button>
                            ) : null}
                            {task?.onManualCheckFailedItem ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setIsStatsOpen(false);
                                  task.onManualCheckFailedItem?.(item);
                                }}
                              >
                                {t("status.manualCheckFailedItem")}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

