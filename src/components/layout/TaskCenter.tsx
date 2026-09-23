import { ActionIcon } from "@/components/ui/action-icon";
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
  DialogFooter,
} from "@/components/ui/dialog";
export function TaskCenter() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tasks = useTaskQueueStore((s) => s.tasks);
  const [filter,setFilter]=useState<"all"|"active"|"attention">("all");
  const needsAttention = (status:string) => ["failed","partial","interrupted"].includes(status);
  const visible = tasks.filter(task=>filter==="all" || (filter==="active" ? isTaskActive(task) : needsAttention(task.status)));
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
      ><ActionIcon action="tasks"/>
        {t("workflow.tasks")} ({tasks.filter(isTaskActive).length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="grid-rows-[auto_auto_minmax(0,1fr)_auto] resize overflow-hidden"
          style={{width:"min(48rem, calc(100vw - 2rem))",height:"min(38rem, calc(100dvh - 2rem))",minWidth:"min(30rem, calc(100vw - 2rem))",minHeight:"min(22rem, calc(100dvh - 2rem))",maxWidth:"calc(100vw - 2rem)",maxHeight:"calc(100dvh - 2rem)"}}>
          <DialogHeader><DialogTitle>{t("workflow.tasks")}</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            {(["all","active","attention"] as const).map(value=><Button key={value} size="sm" variant={filter===value?"default":"outline"} aria-pressed={filter===value} onClick={()=>setFilter(value)}><ActionIcon action={value === "active" ? "active" : value === "attention" ? "error" : "tasks"}/>{t(`workflow.taskFilter.${value}`)} {tasks.filter(task=>value==="all" || (value==="active"?isTaskActive(task):needsAttention(task.status))).length}</Button>)}
          </div>
          <DialogBody className="min-h-0 max-h-none overflow-auto">
            {!visible.length && <p className="py-12 text-center text-sm text-muted-foreground">{t("workflow.noTasks")}</p>}
            {[...visible].reverse().map(task=>{
              const active=isTaskActive(task);
              const completed=task.steps.filter(step=>step.status==="success").length;
              return <section key={task.id} className="border-b py-3 text-sm last:border-b-0">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={task.label}>{task.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t(`workflow.taskKind.${task.kind}`)} · {new Date(task.createdAt).toLocaleString()} · {completed}/{task.steps.length}</p>
                  </div>
                  <span className={needsAttention(task.status)?"text-destructive":"text-muted-foreground"}>{t(active&&task.cancelRequested?"workflow.stopping":`workflow.taskStatus.${task.status}`)}</span>
                  {active ? <Button size="sm" variant="outline" disabled={task.cancelRequested} onClick={()=>useTaskQueueStore.getState().cancel(task.id)}><ActionIcon action="stop"/>{t("workflow.stopTask")}</Button>
                    : task.status!=="success" ? <Button size="sm" variant="outline" onClick={()=>useTaskQueueStore.getState().retry(task.id)}><ActionIcon action="retry"/>{t("workflow.retryTask")}</Button> : null}
                </div>
                {task.status==="running" && <div role="progressbar" aria-label={task.label} aria-valuemin={0} aria-valuenow={completed} aria-valuemax={Math.max(1,task.steps.length)} className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{width:`${completed/Math.max(1,task.steps.length)*100}%`}}/></div>}
                {active&&task.cancelRequested&&<p className="mt-1 text-xs text-muted-foreground">{t("workflow.stopAfterStep")}</p>}
                {task.steps.find(step=>step.error)?.error && <p className="mt-2 text-xs text-destructive">{task.steps.find(step=>step.error)?.error}</p>}
                <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">{t("workflow.details")}</summary>
                  {task.steps.map((step,index)=><p key={index} className="py-1">{step.label} · {t(`workflow.taskStatus.${step.status??"queued"}`)} {step.error}
                    {task.kind==="ai"&&step.status==="success"&&<span className="mt-1 block select-text whitespace-pre-wrap">{Array.isArray(step.result)?step.result.join(", "):typeof step.result==="string"?step.result:""}</span>}
                  </p>)}
                </details>
              </section>;
            })}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={!tasks.some(task=>isTaskActive(task)&&!task.cancelRequested)} onClick={()=>tasks.filter(isTaskActive).forEach(task=>useTaskQueueStore.getState().cancel(task.id))}><ActionIcon action="stop"/>{t("workflow.stopAllTasks")}</Button>
            <Button variant="outline" disabled={!tasks.some(task=>needsAttention(task.status))} onClick={()=>tasks.filter(task=>needsAttention(task.status)).forEach(task=>useTaskQueueStore.getState().retry(task.id))}><ActionIcon action="retry"/>{t("workflow.retry")}</Button>
            <Button variant="outline" disabled={!tasks.some(task=>!isTaskActive(task))} onClick={()=>useTaskQueueStore.getState().clear()}><ActionIcon action="delete"/>{t("workflow.clearHistory")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
