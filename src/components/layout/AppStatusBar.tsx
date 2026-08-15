import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useState } from "react";
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

export function AppStatusBar() {
  const { t } = useTranslation();
  const [isStatsOpen, setIsStatsOpen] = useState(false);
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
      typeof task.skippedCount === "number" ||
      typeof task.failedCount === "number" ||
      (task.items?.length ?? 0) > 0);

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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("status.updateStats")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{t("status.updatedLabel")}</div>
              <div className="mt-1 text-xl font-semibold text-foreground">{task?.updatedCount ?? 0}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{t("status.skippedLabel")}</div>
              <div className="mt-1 text-xl font-semibold text-foreground">{task?.skippedCount ?? 0}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{t("status.failedLabel")}</div>
              <div className="mt-1 text-xl font-semibold text-destructive">{task?.failedCount ?? 0}</div>
            </div>
          </div>
          <DialogBody className="px-0">
            <div className="space-y-1">
              {(task?.items ?? []).map((item) => (
                <div
                  key={`${item.status}:${item.name}:${item.detail ?? ""}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-foreground">{item.name}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      item.status === "failed" && "text-destructive",
                      item.status === "updated" && "text-emerald-600",
                      item.status === "skipped" && "text-muted-foreground"
                    )}
                  >
                    {item.detail ?? item.status}
                  </span>
                </div>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
