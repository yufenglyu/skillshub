import { ActionIcon } from "@/components/ui/action-icon";
import { RepositoryCheckConfirm } from "./RepositoryCheckConfirm";
import {repositoryUpdateRows, updateCategories as categories, updateItemKey, type UpdateCategory as Category} from "@/lib/repositoryUpdateRows";
import { useMemo, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRepositorySyncStore } from "@/stores/repositorySyncStore";
import {
  useTaskQueueStore,
  isTaskActive,
  taskErrorMessage,
} from "@/stores/taskQueueStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
export function UpdateCenter() {
  const { t, i18n } = useTranslation();
  const [confirmCheck, setConfirmCheck] = useState(false);
  const state = useRepositorySyncStore();
  const tasks = useTaskQueueStore((s) => s.tasks);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [retryChoices, setRetryChoices] = useState<Record<string, boolean>>({});
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Category | "ignored" | "failed" | null>(null);
  const [pairs,setPairs] = useState<Record<string,string>>({});
  const rows = useMemo(() => repositoryUpdateRows(state.preview?.repositories ?? [],pairs),[state.preview,pairs]);
  const busy = (key: string) =>
    tasks.some((task) => task.key === key && isTaskActive(task));
  const failed = (key: string) => {
    const latest = [...tasks].reverse().find(task => task.key === key);
    const repo = latest?.steps[0]?.args.repository;
    if (!latest || !["partial", "failed"].includes(latest.status)) return undefined;
    if (typeof repo === "string" && latest.createdAt <= (state.checkedAt[repo.toLowerCase()] ?? 0)) return undefined;
    return latest;
  };
  const ignored = (key: string) => state.ignored.includes(key);
  const selectable = (row: (typeof rows)[number]) => !row.error && !busy(row.key) && (!row.candidates.length || !!row.replacement);
  const applicable = (row: (typeof rows)[number]) => selectable(row) && row.category !== "unchanged" && !ignored(row.key) && (!row.candidates.length || !!row.replacement);
  const checked = (row: (typeof rows)[number]) => selectable(row) &&
    (choices[row.key] ?? (applicable(row) && ["added", "modified"].includes(row.category)));
  const visible = rows.filter((row) =>
    filter === "ignored"
      ? ignored(row.key)
      : !ignored(row.key) && (!filter || row.category === filter),
  );
  const selected = visible.filter(checked);
  const failedRepositories = (state.preview?.repositories ?? []).filter(repo => !!repo.error);
  const visibleFailures = filter === null || filter === "failed" ? failedRepositories : [];
  const selectedFailures = visibleFailures.filter(repo => retryChoices[repo.repository]);
  const selectedRepositories = [...new Set([...selected.map(row => row.repo), ...selectedFailures.map(repo => repo.repository)])];
  const updatesToApply = selected.filter(applicable);
  const replacementsToApply = updatesToApply.filter(row => !!row.replacement);
  const regularUpdatesToApply = updatesToApply.filter(row => !row.replacement);
  const checking = state.isChecking || !!state.checkingRepository;
  const selectableCount = visible.filter(selectable).length + visibleFailures.length;
  const selectedCount = selected.length + selectedFailures.length;
  const allSelected = selectableCount > 0 && selectedCount === selectableCount;
  const partiallySelected = selectedCount > 0 && !allSelected;
  function toggleAll(checked: boolean) {
    setRetryChoices(previous => ({...previous,...Object.fromEntries(visibleFailures.map(repo=>[repo.repository,checked]))}));
    setChoices(previous=>({...previous,...Object.fromEntries(visible.filter(selectable).map(row=>[row.key,checked]))}));
  }
  function apply(items = regularUpdatesToApply) {
    if (checking) return;
    for (const row of items) {
      useTaskQueueStore.getState().enqueue({
        key: row.key,
        kind: "update",
        label: row.item.name,
        locks: [`repo:${row.repo.toLowerCase()}`, `skill:${row.item.skillId}`],
        steps: [
          {
            label: row.item.name,
            command: "apply_repository_update_item",
            args: {
              repository: row.repo,
              skillId: row.item.skillId,
              version: row.item.version ?? "",
              action: row.replacement ? "replace" : row.category,
              ...(row.replacement ? {replacementSkillId:row.replacement.skillId,replacementVersion:row.replacement.version} : {}),
            },
          },
        ],
      });
    }
  }
  return (
    <>
    <RepositoryCheckConfirm open={confirmCheck} onOpenChange={setConfirmCheck} repositories={state.repositories ?? undefined}/>
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <DialogContent
        className="grid-rows-[auto_auto_minmax(0,1fr)_auto] resize overflow-hidden"
        style={{
          width: "min(56rem, calc(100vw - 2rem))",
          height: "min(46rem, calc(100dvh - 2rem))",
          minWidth: "min(36rem, calc(100vw - 2rem))",
          minHeight: "min(24rem, calc(100dvh - 2rem))",
          maxWidth: "calc(100vw - 2rem)",
          maxHeight: "calc(100dvh - 2rem)",
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("workflow.updateStatus")}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t(state.repositories?.length ? "workflow.scopedCheckTime" : "workflow.fullCheckTime")} · {state.reportCheckedAt ? new Date(state.reportCheckedAt).toLocaleString(i18n.language) : t("workflow.checkTimeUnknown")}</p>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={filter === null ? "default" : "outline"} aria-pressed={filter === null} onClick={() => setFilter(null)}><ActionIcon action="filter"/>
            {t("workflow.allUpdates")}
          </Button>
          {categories.map((category) => (
            <Button
              key={category}
              size="sm"
              variant={filter === category ? "default" : "outline"}
              aria-pressed={filter === category}
              onClick={() => setFilter(filter === category ? null : category)}
            ><ActionIcon action={category === "added" ? "add" : category === "deleted" ? "delete" : category === "modified" ? "update" : "success"}/>
              {t(`workflow.change.${category}`)}{" "}
              {
                rows.filter(
                  (row) => row.category === category && !ignored(row.key),
                ).length
              }
            </Button>
          ))}
          <Button size="sm" variant={filter === "failed" ? "default" : "outline"} aria-pressed={filter === "failed"} onClick={() => setFilter("failed")}><ActionIcon action="error"/>
            {t("workflow.checkFailed")} {failedRepositories.length}
          </Button>
          <Button
            size="sm"
            aria-pressed={filter === "ignored"}
            variant={filter === "ignored" ? "default" : "outline"}
            onClick={() => setFilter(filter === "ignored" ? null : "ignored")}
          ><ActionIcon action="ignore"/>
            {t("workflow.ignored")}
          </Button>
        </div>
        <DialogBody className="min-h-0 max-h-none space-y-3 overflow-auto">
          {state.error && (
            <p className="text-destructive">{t("workflow.operationFailed")}</p>
          )}
          {(state.preview?.repositories ?? []).map((repo) => {
            const items = visible.filter((row) => row.repo === repo.repository);
            if (repo.error ? !visibleFailures.includes(repo) : !items.length) return null;
            return (
              <section key={repo.repository} className="rounded border p-3">
                <div className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    aria-label={repo.repository}
                    checked={
                      repo.error ? !!retryChoices[repo.repository] : items.some(selectable) &&
                      items.filter(selectable).every(checked)
                    }
                    onChange={(e) =>
                      repo.error ? setRetryChoices(previous => ({...previous, [repo.repository]: e.target.checked})) : setChoices((previous) => ({
                        ...previous,
                        ...Object.fromEntries(
                          items
                            .filter(selectable)
                            .map((row) => [row.key, e.target.checked]),
                        ),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-label={repo.repository}
                    aria-expanded={!!expanded[repo.repository]}
                    onClick={() =>
                      setExpanded((previous) => ({
                        ...previous,
                        [repo.repository]: !previous[repo.repository],
                      }))
                    }
                  >
                    <ChevronRight
                      className={`size-4 shrink-0 transition-transform ${expanded[repo.repository] ? "rotate-90" : ""}`}
                    />
                    <span className="truncate">{repo.repository}</span>
                    <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                      {repo.error ? t("workflow.checkFailed") : t("workflow.selected", {
                        count: items.filter(checked).length,
                        total: items.length,
                      })}
                    </span>
                  </button>
                </div>
                {state.checkedAt[repo.repository.toLowerCase()] && <p className="mt-1 text-xs text-muted-foreground">{t("workflow.repositoryCheckTime")} · {new Date(state.checkedAt[repo.repository.toLowerCase()]).toLocaleString(i18n.language)}</p>}
                {repo.error && (
                  <p className="text-sm text-destructive">
                    {taskErrorMessage(repo.error)}{" "}

                  </p>
                )}
                {expanded[repo.repository] &&
                  items.map((row) => (
                    <div
                      key={row.key}
                      className="mt-2 rounded bg-muted/20 p-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked(row)}
                          disabled={!selectable(row)}
                          onChange={(e) =>
                            setChoices((previous) => ({
                              ...previous,
                              [row.key]: e.target.checked,
                            }))
                          }
                        />
                        <span>{row.item.name}</span>
                        <span className="ml-auto text-xs">
                          {t(`workflow.change.${row.category}`)}
                        </span>
                        {busy(row.key) && (
                          <span>{t("workflow.taskStatus.running")}</span>
                        )}
                        {filter === "ignored" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              state.setIgnored(
                                state.ignored.filter((key) => key !== row.key),
                              )
                            }
                          ><ActionIcon action="ignore"/>
                            {t("workflow.restoreIgnored")}
                          </Button>
                        )}
                      </div>
                      {row.candidates.length > 0 && <div className="mt-2 space-y-1">
                        <p className="flex items-center gap-1 text-xs">{t("workflow.reimportSource")}
                          <button type="button" className="rounded text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" title={t("workflow.replaceDeletedHint")} aria-label={t("workflow.replaceDeletedHint")}><Info className="size-3.5"/></button>
                        </p>
                        <select aria-label={t("workflow.replacementFor",{name:row.item.name})} className="w-full rounded border bg-background p-1" disabled={busy(row.key) || checking}
                          value={row.replacement ? updateItemKey(row.repo,row.replacement) : ""}
                          onChange={event=>setPairs(previous=>({...previous,[row.pairKey]:event.target.value}))}>
                          <option value="">{t("workflow.chooseReplacement")}</option>
                          {row.candidates.map(candidate=>{const key=updateItemKey(row.repo,candidate);return <option key={key} value={key} disabled={rows.some(other=>other.pairKey!==row.pairKey && other.repo===row.repo && other.replacement===candidate)}>{candidate.name} · {candidate.sourcePath}</option>;})}
                        </select>
                      </div>}
                      {row.category === "deleted" && !row.candidates.length && (
                        <p className="text-xs text-muted-foreground">
                          {t("workflow.remoteDeleted")}
                        </p>
                      )}
                      {failed(row.key) && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                          {
                            failed(row.key)?.steps.find((step) => step.error)
                              ?.error
                          }

                        </div>
                      )}
                      {!!row.item.files?.length && (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer">
                            {t("workflow.files", {
                              count: row.item.files.length,
                            })}
                          </summary>
                          {row.item.files.map((file) => (
                            <p key={file.path}>
                              {t(`workflow.change.${file.status}`)} ·{" "}
                              {file.path}
                            </p>
                          ))}
                        </details>
                      )}
                    </div>
                  ))}
              </section>
            );
          })}
        </DialogBody>
        <DialogFooter className="flex-row flex-wrap items-center gap-x-4 gap-y-3">
          <label className="mr-auto flex items-center gap-2 text-xs">
            <input type="checkbox" aria-label={t("workflow.selectAll")} checked={allSelected}
              aria-checked={partiallySelected ? "mixed" : allSelected}
              ref={node=>{if(node)node.indeterminate=partiallySelected;}}
              disabled={!selectableCount}
              onChange={event=>toggleAll(event.target.checked)} />
            <span>{t("workflow.selectedCompact", {count:selectedCount})}</span>
          </label>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={checking || !selectedRepositories.length}
            onClick={() => void state.recheckRepositories(selectedRepositories)}
          ><ActionIcon action="check"/>
            {t("workflow.recheckSelected")}
          </Button>
          {visibleFailures.length > 0 && <Button size="sm" variant="outline" disabled={checking} onClick={()=>void state.recheckRepositories((selectedFailures.length ? selectedFailures : visibleFailures).map(repo=>repo.repository))}><ActionIcon action="retry"/>{t("workflow.retry")}</Button>}
          <Button size="sm" variant="outline" disabled={checking} onClick={()=>setConfirmCheck(true)}><ActionIcon action="check"/>{t("workflow.checkAllCompact")}</Button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-l pl-4">
          <Button size="sm" variant="outline" disabled={checking || !updatesToApply.length} onClick={()=>state.setIgnored([...new Set([...state.ignored,...updatesToApply.map(row=>row.key)])])}><ActionIcon action="ignore"/>{t("workflow.ignore")}</Button>
          {visible.some(row => row.candidates.length > 0) && <Button size="sm" variant="outline" title={t("workflow.replaceDeleted")} disabled={checking || !replacementsToApply.length} onClick={()=>apply(replacementsToApply)}><ActionIcon action="delete"/>{t("workflow.replaceDeletedCompact")}</Button>}
          <Button size="sm" disabled={checking || !regularUpdatesToApply.length} onClick={()=>apply()}><ActionIcon action="update"/>
            {t("workflow.apply")}
          </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
