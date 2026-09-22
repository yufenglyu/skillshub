import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTaskQueueStore, isTaskActive } from "@/stores/taskQueueStore";
import { isTauriRuntime } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
export function TaskCenter() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tasks = useTaskQueueStore((s) => s.tasks);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (useTaskQueueStore.getState().tasks.some(isTaskActive)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    let dispose: (() => void) | undefined;
    let stopped = false;
    if (isTauriRuntime())
      void import("@tauri-apps/api/window")
        .then(async ({ getCurrentWindow }) => {
          const unlisten = await getCurrentWindow().onCloseRequested(
            async (event) => {
              if (!useTaskQueueStore.getState().tasks.some(isTaskActive))
                return;
              event.preventDefault();
              const { confirm } = await import("@tauri-apps/plugin-dialog");
              if (await confirm(t("workflow.exitTasks"), { kind: "warning" }))
                await getCurrentWindow().destroy();
            },
          );
          if (stopped) unlisten();
          else dispose = unlisten;
        })
        .catch(() => {
          /* No native window is available in browser previews. */
        });
    return () => {
      stopped = true;
      dispose?.();
      window.removeEventListener("beforeunload", before);
    };
  }, [t]);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs"
        onClick={() => setOpen(true)}
      >
        {t("workflow.tasks")} ({tasks.filter(isTaskActive).length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("workflow.tasks")}</DialogTitle>
          </DialogHeader>
          <DialogBody className="max-h-[65vh] space-y-3 overflow-auto">
            {[...tasks].reverse().map((task) => (
              <section key={task.id} className="rounded border p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span>
                    {task.label} · {t(`workflow.taskKind.${task.kind}`)}
                  </span>
                  <span>{t(`workflow.taskStatus.${task.status}`)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {task.steps.filter((s) => s.status === "success").length} /{" "}
                  {task.steps.length}
                </p>
                <details>
                  <summary className="cursor-pointer text-xs">
                    {t("workflow.details")}
                  </summary>
                  {task.steps.map((step, index) => (
                    <p key={index} className="py-1 text-xs">
                      {step.label} ·{" "}
                      {t(`workflow.taskStatus.${step.status ?? "queued"}`)}{" "}
                      {step.error}
                      {task.kind === "ai" && step.status === "success" && (
                        <span className="mt-1 block select-text whitespace-pre-wrap">
                          {Array.isArray(step.result)
                            ? step.result.join(", ")
                            : typeof step.result === "string"
                              ? step.result
                              : ""}
                        </span>
                      )}
                    </p>
                  ))}
                </details>
                {isTaskActive(task) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={task.cancelRequested}
                    onClick={() => useTaskQueueStore.getState().cancel(task.id)}
                  >
                    {t("common.cancel")}
                  </Button>
                ) : task.status !== "success" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => useTaskQueueStore.getState().retry(task.id)}
                  >
                    {t("workflow.retry")}
                  </Button>
                ) : null}
              </section>
            ))}
          </DialogBody>
          <Button
            variant="outline"
            onClick={() => useTaskQueueStore.getState().clear()}
          >
            {t("workflow.clearHistory")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
