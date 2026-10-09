import {ActionIcon} from "@/components/ui/action-icon";
import {useEffect, useState} from "react";
import {ChevronRight} from "lucide-react";
import {useTranslation} from "react-i18next";
import {useTaskQueueStore, isTaskActive, taskErrorMessage, type TaskStep} from "@/stores/taskQueueStore";
import {useRepositorySyncStore} from "@/stores/repositorySyncStore";
import {useAppStatusStore} from "@/stores/appStatusStore";
import {activityGroups, activityAttention, pendingUpdateCount, needsAttention, type ActivityView} from "@/lib/activityCenter";
import {UpdateCenter} from "@/components/skill/UpdateCenter";
import {RepositoryCheckConfirm} from "@/components/skill/RepositoryCheckConfirm";
import {AddSkillsDialog} from "@/components/skill/AddSkillsDialog";
import {PREPARE_GITHUB_IMPORT} from "@/stores/importPreparationStore";
import {isTauriRuntime} from "@/lib/tauri";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
// Only render the known check-report fields; never expose arbitrary IPC args/results.
function RepositoryCheckDetails({step}: {step: TaskStep}) {
  const {t} = useTranslation();
  const scope = Array.isArray(step.args.repositories) ? step.args.repositories.filter((repo): repo is string => typeof repo === "string") : [];
  const result = step.result;
  const repositories = result && typeof result === "object" && "repositories" in result && Array.isArray(result.repositories)
    ? result.repositories.filter((repo): repo is import("@/types").RepositorySyncPreview =>
      repo && typeof repo === "object" && typeof repo.repository === "string" &&
      ["added", "modified", "deleted", "unchanged"].every(category => Array.isArray(repo[category]))) : [];
  const categories = ["added", "modified", "deleted", "unchanged"] as const;
  const successful = repositories.filter(repo => !repo.error);
  return <div className="mt-2 space-y-2">
    <p className="text-muted-foreground">{t("workflow.checkScope")} · {scope.length ? scope.join(", ") : t("workflow.allSourceRepositories")}</p>
    {repositories.length ? <>
      <p>{t("workflow.checkResultSummary", {repositories: repositories.length,
        skills: successful.reduce((sum, repo) => sum + categories.reduce((count, category) => count + repo[category].length, 0), 0),
        failures: repositories.length - successful.length})}</p>
      <ul className="divide-y divide-border">
        {repositories.map(repo => <li key={repo.repository} className="py-2">
          <p className="font-medium">{repo.repository}</p>
          {repo.error ? <p className="mt-1 text-destructive">{t("workflow.checkFailed")} · {taskErrorMessage(repo.error)}</p> : <>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {categories.map(category => <span key={category}>{t(`workflow.change.${category}`)} {repo[category].length}</span>)}
            </div>
            {!!(repo.added.length + repo.modified.length + repo.deleted.length) && <details className="mt-1">
              <summary className="cursor-pointer text-muted-foreground">{t("workflow.changedSkills")}</summary>
              {categories.filter(category => category !== "unchanged").flatMap(category => repo[category].filter(item => typeof item.name === "string").map(item =>
                <p key={`${category}:${item.skillId}`} className="py-0.5">{t(`workflow.change.${category}`)} · {item.name}</p>))}
            </details>}
          </>}
        </li>)}
      </ul>
    </> : <p className="text-muted-foreground">{t(step.status === "running" || step.status === "queued" ? "workflow.checkDetailsPending" : "workflow.checkDetailsUnavailable")}</p>}
  </div>;
}


function ImportStepDetails({step}: {step: TaskStep}) {
  const {t} = useTranslation();
  const result = step.result;
  if (!result || typeof result !== "object" || !("importedSkills" in result) || !Array.isArray(result.importedSkills)) return null;
  return <div>{result.importedSkills.map((item, index) => typeof item?.skillName === "string" ? <p key={index}>{item.skillName} · {t("status.importedLabel")}</p> : null)}</div>;
}

export function TaskCenter() {
  const {t, i18n} = useTranslation();
  const state = useRepositorySyncStore();
  const tasks = useTaskQueueStore(s => s.tasks).filter(task => !task.clearRequested);
  const importResult = useAppStatusStore(s => s.task);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmCheck, setConfirmCheck] = useState(false);
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const {attention, count: attentionCount} = activityAttention(tasks, state.preview, state.checkedAt, state.error);
  const pending = pendingUpdateCount(state.preview, state.ignored, tasks) + attentionCount + (state.error ? 1 : 0);
  const groups = activityGroups(tasks);
  const activeGroups = groups.filter(group => group.items.some(isTaskActive));
  const view: ActivityView = state.centerView ?? (pending ? "pending" : activeGroups.length ? "active" : "history");
  const visible = groups.filter(group => view === "active" ? group.items.some(isTaskActive) : view === "pending"
    ? group.items.some(task => attention.includes(task))
    : !group.items.some(isTaskActive) && !group.items.some(task => task.status === "awaiting_input"));
  const toggle = (id: string) => setExpanded(previous => ({...previous, [id]: !previous[id]}));
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

  function renderGroups() {
    return visible.map(group => {
      const active = group.items.some(isTaskActive);
      const completed = group.items.reduce((sum, task) => sum + task.steps.filter(step => step.status === "success").length, 0);
      const total = group.items.reduce((sum, task) => sum + task.steps.length, 0);
      const failed = group.items.filter(task => needsAttention(task) && task.status !== "awaiting_input").length;
      const reviewTask = group.items.find(task => task.status === "awaiting_input" && task.steps.some(step => step.command === PREPARE_GITHUB_IMPORT));
      const stopRequested = active && group.items.filter(isTaskActive).every(task => task.cancelRequested);
      const checkReports = group.items.flatMap(task => task.steps.filter(step => step.command === "preview_source_backed_resource_repository_updates" && step.status === "success").map(step => step.result as import("@/types").RepositorySyncPreviewReport | undefined));
      const changedCount = checkReports.reduce((sum, report) => sum + (report?.repositories?.reduce<number>((count, repo) => count + repo.added.length + repo.modified.length + repo.deleted.length, 0) ?? 0), 0);
      const status = active ? stopRequested ? "stopping" : group.items.some(task => task.status === "running") ? "taskStatus.running" : "taskStatus.queued" : reviewTask ? "taskStatus.awaiting_input" : failed ? "taskStatus.partial" : `taskStatus.${group.items[0].status}`;
      return <section key={group.id} className="cursor-pointer rounded-lg border p-3 text-sm" onClick={event => {
        if (!(event.target as HTMLElement).closest("button,input,textarea,select,a,summary")) toggle(group.id);
      }}>
        <div className="flex flex-wrap items-start gap-2">
          <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={!!expanded[group.id]} aria-controls={`task-details-${group.id}`} onClick={() => toggle(group.id)}>
            <span className="flex items-center gap-2 font-medium"><ChevronRight className={`size-4 shrink-0 ${expanded[group.id] ? "rotate-90" : ""}`}/><span className="truncate">{group.label}</span></span>
            <span className="mt-1 block text-xs text-muted-foreground">{t(`workflow.taskKind.${group.items[0].kind}`)} · {new Date(group.items[0].createdAt).toLocaleString(i18n.language)} · {t("workflow.taskSteps", {completed, total})}</span>
          </button>
          <span className={failed ? "text-destructive" : "text-muted-foreground"}>{t(`workflow.${status}`)}</span>
          {reviewTask && <Button size="sm" onClick={() => setReviewTaskId(reviewTask.id)}>{t("workflow.resumeImport")}</Button>}
          {active ? <Button size="sm" variant="outline" disabled={stopRequested} onClick={() => group.items.filter(isTaskActive).forEach(task => useTaskQueueStore.getState().cancel(task.id))}><ActionIcon action="stop"/>{t("workflow.stopTask")}</Button>
            : failed > 0 || group.items.some(task => task.status === "cancelled") ? <Button size="sm" variant="outline" onClick={() => group.items.filter(task => needsAttention(task) || task.status === "cancelled").forEach(task => useTaskQueueStore.getState().retry(task.id))}><ActionIcon action="retry"/>{t("workflow.retryTask")}</Button> : null}
          {!active && <Button size="sm" variant="ghost" aria-label={t("workflow.deleteTaskRecord", {name:group.label})} onClick={() => group.items.forEach(task => useTaskQueueStore.getState().remove(task.id))}><ActionIcon action="delete"/>{t("workflow.deleteRecord")}</Button>}
        </div>
        {checkReports.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{t("workflow.checkedChanges", {count:changedCount})}</p>}
        {group.items.length > 1 && <p className="mt-2 text-xs text-muted-foreground">{t("workflow.batchProgress", {completed: group.items.filter(task => task.status === "success").length, running: group.items.filter(task => task.status === "running").length, queued: group.items.filter(task => task.status === "queued").length, failed})}</p>}
        {active && <div role="progressbar" aria-label={group.label} aria-valuemin={0} aria-valuenow={completed} aria-valuemax={Math.max(1,total)} className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:`${completed / Math.max(1,total) * 100}%`}}/></div>}
        {group.items.some(task => isTaskActive(task) && task.cancelRequested) && <p className="mt-2 text-xs text-muted-foreground">{t("workflow.stopAfterStep")}</p>}
        {expanded[group.id] && <div id={`task-details-${group.id}`} className="mt-3 cursor-auto space-y-2 border-t pt-2 text-xs" onClick={event => event.stopPropagation()}>
          {group.items.map(task => <div key={task.id} className="space-y-1">
            {group.items.length > 1 && <p className="font-medium">{task.label} · {t(`workflow.taskStatus.${task.status}`)}</p>}
            {group.items.length > 1 && !isTaskActive(task) && <Button size="sm" variant="ghost" aria-label={t("workflow.deleteTaskRecord", {name:task.label})} onClick={() => useTaskQueueStore.getState().remove(task.id)}><ActionIcon action="delete"/>{t("workflow.deleteRecord")}</Button>}
            {task.steps.map((step,index) => <div key={index}>
              <p>{step.label} · {t(`workflow.taskStatus.${step.status ?? "queued"}`)}</p>
              {step.error && <p className="text-destructive">{taskErrorMessage(step.error, task.kind)}</p>}
              {step.command === "preview_source_backed_resource_repository_updates" && <RepositoryCheckDetails step={step}/>}
              {task.kind === "ai" && step.status === "success" && <p className="select-text whitespace-pre-wrap">{typeof step.result === "string" ? step.result : Array.isArray(step.result) && step.result.every(item => typeof item === "string") ? step.result.join(", ") : ""}</p>}
              {task.kind === "import" && step.status === "success" && <ImportStepDetails step={step}/>}
            </div>)}
          </div>)}
        </div>}
      </section>;
    });
  }
  return <>
    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => state.setOpen(true)}><ActionIcon action="tasks"/>{t("workflow.activityTitle")} · {t("workflow.activitySummary", {running: tasks.filter(isTaskActive).length, pending})}</Button>
    <RepositoryCheckConfirm open={confirmCheck} onOpenChange={setConfirmCheck}/>
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <DialogContent className="flex resize flex-col overflow-hidden" style={{width:"min(64rem, calc(100vw - 2rem))", height:"min(46rem, calc(100dvh - 2rem))", minWidth:"min(32rem, calc(100vw - 2rem))", minHeight:"min(24rem, calc(100dvh - 2rem))", maxWidth:"calc(100vw - 2rem)", maxHeight:"calc(100dvh - 2rem)"}}>
        <DialogHeader><DialogTitle>{t("workflow.activityTitle")}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          {(["pending", "active", "history"] as const).map(value => <Button key={value} size="sm" variant={view === value ? "default" : "outline"} aria-pressed={view === value} onClick={() => state.setCenterView(value)}>{t(`workflow.activityView.${value}`)} {value === "pending" ? pending : value === "active" ? activeGroups.length : groups.filter(group => !group.items.some(isTaskActive) && !group.items.some(task => task.status === "awaiting_input")).length}</Button>)}
          <Button className="ml-auto" size="sm" variant="outline" disabled={state.isChecking || !!state.checkingRepository} onClick={() => setConfirmCheck(true)}><ActionIcon action="check"/>{t("workflow.checkAllCompact")}</Button>
        </div>
        <div hidden={view !== "pending"} className={view === "pending" ? "flex min-h-0 flex-1 flex-col gap-3 overflow-auto" : "hidden"}>{view === "pending" && visible.length > 0 && <div className="space-y-2">{renderGroups()}</div>}<UpdateCenter key={state.reportGeneration ?? "initial"} embedded/></div>
        {view !== "pending" && <div className="min-h-0 flex-1 space-y-3 overflow-auto">{!visible.length && !(view === "history" && importResult?.kind === "import") && <p className="py-12 text-center text-sm text-muted-foreground">{t("workflow.noTasks")}</p>}{renderGroups()}
            {view === "history" && importResult?.kind === "import" && importResult.status !== "running" && <section className="rounded-lg border p-3 text-sm"><p className="mb-2 font-medium">{t("status.importStats")}</p>{importResult.items?.map((item,index) => <div key={index} className="flex flex-wrap items-center gap-2 border-t py-2"><span>{item.name}</span><span className="text-xs text-muted-foreground">{item.repository}</span><span className="ml-auto text-xs">{t(item.status === "updated" ? "status.importedLabel" : item.status === "failed" ? "status.importFailedLabel" : "status.skippedLabel")}</span>{item.status === "failed" && importResult.onRetryFailedItem && <Button size="sm" variant="outline" onClick={() => importResult.onRetryFailedItem?.(item)}>{t("status.retryFailedItem")}</Button>}</div>)}</section>}
          </div>}
        {view !== "pending" && <div className="flex justify-end gap-2 border-t pt-3">
          {view === "active" ? <Button variant="outline" disabled={!tasks.some(task => isTaskActive(task) && !task.cancelRequested)} onClick={() => tasks.filter(isTaskActive).forEach(task => useTaskQueueStore.getState().cancel(task.id))}><ActionIcon action="stop"/>{t("workflow.stopAllTasks")}</Button>
            : <Button variant="outline" disabled={!groups.some(group => !group.items.some(isTaskActive) && group.items.some(task => task.status === "success" || task.status === "cancelled")) && !(importResult && importResult.status !== "running")} onClick={() => {useTaskQueueStore.getState().clearFinished(); if (importResult?.status !== "running") useAppStatusStore.getState().resetStatus();}}><ActionIcon action="delete"/>{t("workflow.clearFinished")}</Button>}
        </div>}
      </DialogContent>
    </Dialog>
    {reviewTaskId && <AddSkillsDialog key={reviewTaskId} preparedTaskId={reviewTaskId} open onOpenChange={open => {if (!open) setReviewTaskId(null);}}/>}
  </>;
}
